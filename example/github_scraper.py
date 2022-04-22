import os
import asyncio
import aiohttp
import logging
from tqdm.asyncio import tqdm
from typing import Callable, Any, Dict, List, Tuple


class GithubScraperClient:
    def __init__(
        self, baseurl: str, auth: str, num_workers=10, num_retries=3, max_pages=10
    ) -> None:
        """
        Initialize a GithubScraperClient.
        :param baseurl: the base url of the scraper
        :param auth: the scraper authorization token
        :param num_workers: max number of parallel fetching workers (default: 10, lower this when encountering '429 Too Many Requests')
        :param num_retries: max number of retries for one fetch failure (default: 3)
        :param max_pages: max number of subrequests on a single fetch (default: 10, lower this if the request exceeds CloudFlare Workers' runtime limit)

        >>> client = GithubScraperClient(
        ...     "https://your.scraper.url",
        ...     "your_auth_token",
        ...     num_workers=10,
        ...     num_retries=3,
        ...     max_pages=10
        ... )
        """
        self._logger = logging.getLogger(__name__)
        self._baseurl = baseurl
        self._auth = auth
        self._num_retries = num_retries
        self._max_pages = max_pages
        self._semaphore = asyncio.Semaphore(num_workers)

    async def _fetch(self, url: str, params: Dict[str, str]) -> Dict[str, Any]:
        """
        Fetch a URL and return the response.
        """
        headers = {
            "Authorization": self._auth,
        }
        async with self._semaphore:
            async with self._session.get(
                url, params=params, headers=headers
            ) as response:
                data = await response.json()
                if response.status != 200:
                    raise Exception(
                        f"{response.status} {response.reason} {data['error']}"
                    )
                return data

    async def _get(self, url: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        """
        fetch a url with pagination and error handling and return the response.
        """
        has_next = True
        all_res = []
        retries = self._num_retries

        while has_next and retries > 0:
            data = None
            try:
                data = await self._fetch(url, params)
            except Exception as e:
                self._logger.error(
                    f"{e}: retrying {self._num_retries-retries+1}/{self._num_retries}"
                )
                # not found, skip this page
                if "not found" in str(e).lower():
                    retries = 0
                else:
                    retries -= 1
                    await asyncio.sleep(10)
                continue

            if len(data) == 0 or "data" not in data.keys():
                raise Exception(f"has no body: {params} {data}")

            all_res.extend(data["data"])

            # update params for next iter
            has_next = "next" in data.keys()
            if has_next:
                retries = self._num_retries
                if "current" in data:
                    params["fromPage"] = int(data["current"]) + 1
                elif "after" in data:
                    params["after"] = data["after"]
                else:
                    raise Exception(f"has no next page: {params} {data}")

        # failed, return current list
        if retries == 0:
            self._logger.error(
                f"fetch {url} {params} failed after {self._num_retries} retries"
            )

        return all_res

    async def _get_with_callback(
        self, url: str, params: Dict[str, str], callback: Callable[[List, Dict], Any]
    ) -> None:
        """
        get a url and execute a callback on each page.
        """
        all_res = await self._get(url, params)
        callback(all_res, params)

    def get_all(
        self, url: str, queries: List[Dict[str, str]]
    ) -> List[List[Dict[str, Any]]]:
        """
        fetch all pages of a url and return the response.
        :param url: the url to fetch
        :param queries: the list of params
        :return: a list of all responses
        """
        conn = aiohttp.TCPConnector(
            limit_per_host=100, limit=0, ttl_dns_cache=300)
        loop = asyncio.get_event_loop()

        async def async_worker():
            self._session = aiohttp.ClientSession(connector=conn)
            try:
                res = await tqdm.gather(*(self._get(url, params) for params in queries))
                return res
            except Exception as e:
                self._logger.exception(e)
            finally:
                await self._session.close()

        res = loop.run_until_complete(async_worker())
        conn.close()
        return res

    def get_all_with_callback(
        self,
        url: str,
        queries: List[Dict[str, str]],
        callback: Callable[[List, Dict], Any],
    ) -> None:
        """
        fetch all pages of a url and execute a callback on each page.
        :param url: the url to fetch
        :param queries: the list of params
        :param callback: the callback to execute on each page (result: list, params: dict) -> None
        """
        # Initialize connection pool
        conn = aiohttp.TCPConnector(
            limit_per_host=100, limit=0, ttl_dns_cache=300)
        loop = asyncio.get_event_loop()

        async def async_worker():
            self._session = aiohttp.ClientSession(connector=conn)
            try:
                await tqdm.gather(
                    *(
                        self._get_with_callback(url, params, callback)
                        for params in queries
                    )
                )
            except Exception as e:
                self._logger.exception(e)
            finally:
                await self._session.close()

        loop.run_until_complete(async_worker())
        conn.close()

    def get_issue_lists_with_callback(
        self,
        queries_list: List[Dict[str, str]],
        callback: Callable[[List, Dict], Any],
    ) -> None:
        """
        fetch all pages of a repo's issues and execute a callback on each page.
        :param queries_list: the list of params ({owner: str, name: str, query?: str})
        :param callback: the callback to execute on each page (result: list, params: dict) -> None

        >>> client = GithubScraperClient(baseurl="https://your.scraper.url", auth="token")
        >>> queries_list = [
        ...     {"owner": "octocat", "name": "Hello-World"},
        ...     {"owner": "octocat", "name": "Hello-World", "query": "is:closed is:issue"},
        ... ]
        >>> client.get_issue_lists_with_callback(queries_list, callback=lambda x, y: print(x, y))
        """
        url = f"{self._baseurl}/issues"
        queries = [
            {
                "owner": q["owner"],
                "name": q["name"],
                "query": q["query"] if "query" in q else "is:issue",
                "fromPage": 1,
                "maxPages": self._max_pages,
            }
            for q in queries_list
        ]

        self.get_all_with_callback(url, queries, callback)

    def get_pull_lists_with_callback(
        self,
        queries_list: List[Dict[str, str]],
        callback: Callable[[List, Dict], Any],
    ) -> None:
        """
        fetch all pages of a repo's pull requests and execute a callback on each page.
        :param queries_list: the list of params ({owner: str, name: str, query?: str})
        :param callback: the callback to execute on each page (result: list, params: dict) -> None

        >>> client = GithubScraperClient(baseurl="https://your.scraper.url", auth="token")
        >>> queries_list = [
        ...     {"owner": "octocat", "name": "Hello-World"},
        ...     {"owner": "octocat", "name": "Hello-World", "query": "is:closed is:pr"},
        ... ]
        >>> client.get_issue_lists_with_callback(queries_list, callback=lambda x, y: print(x, y))
        """

        url = f"{self._baseurl}/pulls"
        queries = [
            {
                "owner": q["owner"],
                "name": q["name"],
                "query": q["query"] if "query" in q else "is:pr",
                "fromPage": 1,
                "maxPages": self._max_pages,
            }
            for q in queries_list
        ]

        self.get_all_with_callback(url, queries, callback)

    def get_issues_with_callback(
        self, queries_list: List[Dict[str, str or int]], callback: Callable[[List, Dict], Any]
    ) -> None:
        """
        fetch a repo's issue and execute a callback on it.
        :param queries: the list of issues {owner: str, name: str, id: int}
        :param callback: the callback to execute on the issue (results: list, params: dict) -> None

        >>> client = GithubScraperClient(baseurl="https://your.scraper.url", auth="token")
        >>> queries_list = [
        ...     {"owner": "octocat", "name": "Hello-World", "id": 1},
        ... ]
        >>> client.get_issues_with_callback(queries_list, callback=lambda x, y: print(x, y))
        """
        url = f"{self._baseurl}/issue"

        self.get_all_with_callback(url, queries_list, callback)

    def get_pulls_with_callback(
        self, queries_list: List[Dict[str, str or int]], callback: Callable[[List, Dict], Any]
    ) -> None:
        """
        fetch a repo's PR and execute a callback on it.
        :param queries: the list of issues {owner: str, name: str, id: int}
        :param callback: the callback to execute on the PR (results: list, params: dict) -> None

        >>> client = GithubScraperClient(baseurl="https://your.scraper.url", auth="token")
        >>> queries_list = [
        ...     {"owner": "octocat", "name": "Hello-World", "id": 2},
        ... ]
        >>> client.get_issue_lists_with_callback(queries_list, callback=lambda x, y: print(x, y))
        """
        url = f"{self._baseurl}/pull"

        self.get_all_with_callback(url, queries_list, callback)

    def get_dependents_with_callback(
        self,
        queries_list: List[Dict[str, str]],
        callback: Callable[[List, Dict], Any],
    ) -> None:
        """
        fetch all pages of a repo's dependents and execute a callback on each page.
        :param queries_list: the list of queries {owner: str, name: str, type?: str, pa
        :param callback: the callback to execute on each page (result: list, params: dict) -> None

        >>> client = GithubScraperClient(baseurl="https://your.scraper.url", auth="token")
        >>> queries_list = [
        ...     {"owner": "octocat", "name": "Hello-World"},
        ...     {"owner": "octocat", "name": "Hello-World", "type": "REPOSITORY"},
        ...     {"owner": "octocat", "name": "Hello-World", "type": "PACKAGE", "package_id": "UGFja2FnZS0yOTQyNTU2OTcx"},
        ... ]
        >>> client.get_dependents_with_callback(queries_list, callback=lambda x, y: print(x, y))
        """
        url = f"{self._baseurl}/dependents"
        queries = [
            {
                "owner": q["owner"],
                "name": q["name"],
                "type": q["type"] if "type" in q else "",
                "packageId": q["package_id"] if "package_id" in q else "",
                "after": q["after"] if "after" in q else "",
                "maxPages": self._max_pages,
            }
            for q in queries_list
        ]

        self.get_all_with_callback(url, queries, callback)


if __name__ == "__main__":
    # # Uncomment the following lines to run in jupyter notebook
    # %pip install nest_asyncio
    # import nest_asyncio
    # nest_asyncio.apply()

    import pandas as pd

    def callback(results: list, params: dict) -> None:
        if not results:
            return

        df = pd.DataFrame(results)

        filename = f"{params['owner']}_{params['name']}"
        filename += f"{'_' + params['type'] if 'type' in params and params['type'] else ''}"
        filename += f"{'_' + params['package_id'] if 'packageId' in params and params['packageId'] else ''}"
        filename += ".csv"
        print(f"{params}: {len(df)} entries > {filename}")

        df.drop(columns=['id'], inplace=True)
        df.to_csv(filename, index=False)

    scraper = GithubScraperClient(
        baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU"
    )

    scraper.get_dependents_with_callback(
        [
            {
                "name": "focus-trap",
                "owner": "focus-trap",
                "type": "PACKAGE",
            }
        ],
        callback,
    )
