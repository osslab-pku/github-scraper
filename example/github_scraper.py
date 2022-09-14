import asyncio
import aiohttp
import logging
from tqdm.asyncio import tqdm
from typing import Callable, Any, Dict, List, Optional


class GithubScraperClient:
    def __init__(
        self, baseurl: str, auth: str, num_workers=10, num_retries=3, max_pages=10, proxy:Optional[str]=None
    ) -> None:
        """
        Initialize a GithubScraperClient.
        :param baseurl: the base url of the scraper
        :param auth: the scraper authorization token
        :param num_workers: max number of parallel fetching workers (default: 10, lower this when encountering '429 Too Many Requests')
        :param num_retries: max number of retries for one fetch failure (default: 3)
        :param max_pages: max number of subrequests on a single fetch (default: 10, lower this if the request exceeds CloudFlare Workers' runtime limit)
        :param proxy: the http proxy to use, e.g. http://localhost:1080 (default: None)
        >>> client = GithubScraperClient(
        ...     "https://your.scraper.url",
        ...     "your_auth_token",
        ...     num_workers=10,
        ...     num_retries=3,
        ...     max_pages=10,
        ...     proxy="http://user:pass@some.proxy.com"
        ... )
        """
        self._logger = logging.getLogger(__name__)
        self._baseurl = baseurl
        self._auth = auth
        self._num_retries = num_retries
        self._max_pages = max_pages
        self._semaphore = asyncio.Semaphore(num_workers)
        self._proxy = proxy

    async def _fetch(self, url: str, params: Dict[str, str]) -> Dict[str, Any]:
        """
        Fetch a URL and return the response.
        """
        headers = {
            "Authorization": self._auth,
        }
        async with self._semaphore:
            async with self._session.get(
                url, params=params, headers=headers, proxy=self._proxy
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
            self._session = aiohttp.ClientSession(connector=conn, trust_env=True)
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
            self._session = aiohttp.ClientSession(connector=conn, trust_env=True)
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
        >>> client.get_issue_lists_with_callback(queries_list, callback=lambda x, y: print(x, y, sep="\\n"))
        [{'id': 1719, 'state': 'closed', 'title': 'Yellow !', 'author': 'leonnelkakpo', 'actedAt': '2022-01-14T00:46:41Z'}]
        {'owner': 'octocat', 'name': 'Hello-World', 'query': 'is:issue'}
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
        >>> client.get_issue_lists_with_callback(queries_list, callback=lambda x, y: print(x, y, sep="\\n"))
        [{'id': 1719, 'state': 'merged', 'title': 'Yellow !', 'author': 'leonnelkakpo', 'actedAt': '2022-01-14T00:46:41Z'}]
        {'owner': 'octocat', 'name': 'Hello-World', 'query': 'is:pr'}
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
        >>> client.get_issues_with_callback(queries_list, callback=lambda x, y: print(x, y, sep="\\n"))
        [{'itemId': '1', 'type': 'close', 'text': 'leonnelkakpo closed this as completed  Jan 14, 2022', 
        'mentionedLinks': ['https://github.com/leonnelkakpo', 'https://github.com/octocat/Hello-World/issues?q=is%3Aissue+is%3Aclosed+archived%3Afalse+reason%3Acompleted'], 
        'author': 'leonnelkakpo', 'actedAt': '2022-01-14T00:46:41Z'}]
        {'owner': 'octocat', 'name': 'Hello-World', 'id': 1}
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
        >>> client.get_pulls_lists_with_callback(queries_list, callback=lambda x, y: print(x, y, sep="\\n"))
        [{'itemId': '1', 'type': 'close', 'text': 'leonnelkakpo closed this as completed  Jan 14, 2022', 
        'mentionedLinks': ['https://github.com/leonnelkakpo', 'https://github.com/octocat/Hello-World/issues?q=is%3Aissue+is%3Aclosed+archived%3Afalse+reason%3Acompleted'], 
        'author': 'leonnelkakpo', 'actedAt': '2022-01-14T00:46:41Z'}]
        {'owner': 'octocat', 'name': 'Hello-World', 'id': 2}
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
        >>> client.get_dependents_with_callback(queries_list, callback=lambda x, y: print(x, y, sep="\\n"))
        [{'id': 1, 'owner': 'martin-mcinerney', 'name': 'django-lets-go', 'stars': 0, 'forks': 0}]
        {"owner": "octocat", "name": "Hello-World", "type": "REPOSITORY"}
        """
        url = f"{self._baseurl}/dependents"
        queries = [
            {
                "owner": q["owner"],
                "name": q["name"],
                "type": q["type"] if "type" in q else "REPOSITORY",
                "packageId": q["package_id"] if "package_id" in q else "",
                "after": q["after"] if "after" in q else "",
                "maxPages": self._max_pages,
            }
            for q in queries_list
        ]

        self.get_all_with_callback(url, queries, callback)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mongo-url", default="mongodb://localhost:27017", help="MongoDB URL")
    parser.add_argument("--mongo-db", default="github", help="MongoDB database name")
    parser.add_argument("--scraper-url", default="https://scraper.12f23eddde.workers.dev/github", help="Scraper URL")
    parser.add_argument("--scraper-auth", default="OSSLab@PKU", help="Scraper auth token")
    parser.add_argument("--issue-list", nargs="+", help="collection, # of workers for issue list (e.g. --issue-list issues 5) ")
    parser.add_argument("--pull-list", nargs="+", help="(collection, # of workers) for pull list (e.g. --pull-list pulls 5)")
    parser.add_argument("--issue-body", nargs="+", help="(collection, # of workers) for issue body (e.g. --issue-body issues 25)")
    parser.add_argument("--pull-body", nargs="+", help="(collection, # of workers) for pull body (e.g. --pull-body pulls 25)")
    args = parser.parse_args()

    import pymongo
    client = pymongo.MongoClient(args.mongo_url)
    db = getattr(client, args.mongo_db)

    def get_project_list() -> list:
        """get the list of projects to scrape ([{name: xx, owner: xx}, ...])"""
        import pandas as pd
        df_raw = pd.read_excel("rn-projects.xlsx")
        s_projects = df_raw[df_raw["FLAG"] == 1]["Name"].unique()
        return [{"owner": p.split("/")[0], "name": p.split("/")[1]} for p in s_projects]

    def get_issue_list() -> list:
        """get the list of issues to scrape ([{name: xx, owner: xx, id: xx}, ...])"""
        # _issue_col, _ = get_args(getattr(args, "issue_list"), "issue_list")
        # return list(getattr(db, _issue_col).find({}, {"owner": 1, "name": 1, "id": 1, "_id": 0}))
        return list(db.issues.find(projection={"owner": 1, "name": 1, "id": 1, "_id": 0}))

    def get_pull_list() -> list:
        """get the list of PRs to scrape ([{name: xx, owner: xx, id: xx}, ...])"""
        # _pull_col, _ = get_args(getattr(args, "pull_list"), "pull_list")
        # return list(getattr(db, _pull_col).find({}, {"owner": 1, "name": 1, "id": 1, "_id": 0}))
        return list(db.pull_requests.find(projection={"owner": 1, "name": 1, "id": 1, "_id": 0}))

    def get_args(_l: list, _to_scrape: str):
        _l = getattr(args, _to_scrape)
        if _l is None:
            return None, None
        if len(_l) > 0:
            _collection = _l[0]
        else:
            _collection = _to_scrape
        if len(_l) > 1:
            _workers = int(_l[1])
        elif "list" in _to_scrape:
            _workers = 5
        else:
            _workers = 25
        return _collection, _workers

    for _to_scrape in ["issue_list", "pull_list", "issue_body", "pull_body"]:
        _collection, _workers = get_args(getattr(args, _to_scrape), _to_scrape)
        if not _collection:
            continue
        print("Scraping %s with %d workers > %s.%s" % (_to_scrape, _workers, args.mongo_db, _collection))
        
        scraper = GithubScraperClient(
            baseurl=args.scraper_url, auth=args.scraper_auth, num_workers=_workers
        )

        if _to_scrape == "issue_list":
            # scrape brief issue info (id, title, actedAt, state, checks) and save to mongodb
            def _callback(results: list, params: dict) -> None:
                if not results:
                    return
                for result in results:
                    getattr(db, _collection).replace_one(
                        {
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": result["id"],
                        },
                        {
                            **result,
                            "owner": params["owner"],
                            "name": params["name"],
                        },
                        upsert=True,
                        )
                print(f"project: {params['owner']}/{params['name']}, results: {len(results)}, head: {results[:1]}")
            project_list = get_project_list()
            print(f"Total projects: {len(project_list)}, first 5: {project_list[:5]}")
            # create index
            getattr(db, _collection).create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING)], unique=True)
            # run query
            scraper.get_issue_lists_with_callback(project_list, _callback)

        elif _to_scrape == "pull_list":
            # scrape brief pull info (id, title, actedAt, state, checks) and save to mongodb
            def _callback(results: list, params: dict) -> None:
                if not results:
                    return
                for result in results:
                    getattr(db, _collection).replace_one(
                        {
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": result["id"],
                        },
                        {
                            **result,
                            "owner": params["owner"],
                            "name": params["name"],
                        },
                        upsert=True,
                        )
                print(f"project: {params['owner']}/{params['name']}, results: {len(results)}, head: {results[:1]}")
            project_list = get_project_list()
            print(f"Total projects: {len(project_list)}, first 5: {project_list[:5]}")
            # create index
            getattr(db, _collection).create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING)], unique=True)
            # run query
            scraper.get_pull_lists_with_callback(project_list, _callback)
        
        elif _to_scrape == "issue_body":
            # scrape issue body and save to mongodb
            def _callback(results: list, params: dict) -> None:
                if not results:
                    return
                for result in results:
                    getattr(db, _collection).replace_one(
                        {
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": params["id"],
                            "itemId": result["itemId"],
                        },
                        {
                            **result,
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": params["id"],
                        },
                        upsert=True,
                    )

            list_issues = get_issue_list()
            print(f"Total issues: {len(list_issues)}, first 5: {list_issues[:5]}")
            # create index
            getattr(db, _collection).create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING), ("itemId", pymongo.ASCENDING)], unique=True)
            # run query
            scraper.get_issues_with_callback(list_issues, _callback)

        elif _to_scrape == "pull_body":
            # scrape pull body and save to mongodb
            def _callback(results: list, params: dict) -> None:
                if not results:
                    return
                for result in results:
                    getattr(db, _collection).replace_one(
                        {
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": params["id"],
                            "itemId": result["itemId"],
                        },
                        {
                            **result,
                            "owner": params["owner"],
                            "name": params["name"],
                            "id": params["id"],
                        },
                        upsert=True,
                    )

            list_pulls = get_pull_list()
            print(f"Total pulls: {len(list_pulls)}, first 5: {list_pulls[:5]}")
            # create index
            getattr(db, _collection).create_index([("owner", pymongo.ASCENDING), ("name", pymongo.ASCENDING), ("id", pymongo.ASCENDING), ("itemId", pymongo.ASCENDING)], unique=True)
            # run query
            scraper.get_pulls_with_callback(list_pulls, _callback)

