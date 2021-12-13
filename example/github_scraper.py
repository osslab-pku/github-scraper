# Async client for github.com/12f23eddde/github-scraper
# ref: https://blog.jonlu.ca/posts/async-python-http
# 12f23eddde <12f23eddde@gmail.com> - Dec 4, 2021

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
        :param auth: the authorization token
        :param num_workers: the number of workers to fetch pages (default: 10, <=30 is recommended)
        :param num_retries: the number of retries to fetch pages (default: 3)
        :param max_pages: limit number of subrequests on a single fetch (default: 10, <=10 is recommended)
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
                # failed, return current list
                if retries == 0:
                    self._logger.error(
                        f"fetch {url} {params} failed after {self._num_retries} retries"
                    )
                    break
                # hit rate limit, sleep and retry
                elif "too many requests" in str(e).lower():
                    retries -= 1
                    await asyncio.sleep(10)
                # not found, skip this page
                elif "not found" in str(e).lower():
                    has_next = False
                else:
                    retries -= 1
                continue

            if len(data) == 0 or "data" not in data.keys():
                raise Exception(f"{params} has no body")

            all_res.extend(data["data"])

            # update params for next iter
            has_next = "next" in data.keys()
            if has_next:
                retries = self._num_retries
                params["fromPage"] = int(data["current"]) + 1

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
        conn = aiohttp.TCPConnector(limit_per_host=100, limit=0, ttl_dns_cache=300)
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
        conn = aiohttp.TCPConnector(limit_per_host=100, limit=0, ttl_dns_cache=300)
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
        repos_list: List[str],
        callback: Callable[[List, Dict], Any],
        query="is:issue",
    ) -> None:
        """
        fetch all pages of a repo's issues and execute a callback on each page.
        :param repos_list: the list of repos
        :param callback: the callback to execute on each page (result: list, params: dict) -> None
        :param query: the query to filter issues on GitHub issues page (e.g. "is:issue")
        """
        url = f"{self._baseurl}/issues"
        queries = [
            {
                "owner": name_with_owner.split("/")[0],
                "name": name_with_owner.split("/")[1],
                "query": query,
                "fromPage": 1,
                "maxPages": self._max_pages,
            }
            for name_with_owner in repos_list
        ]

        self.get_all_with_callback(url, queries, callback)

    def get_pull_lists_with_callback(
        self,
        repos_list: List[str],
        callback: Callable[[List, Dict], Any],
        query="is:pr",
    ) -> None:
        """
        fetch all pages of a repo's pull requests and execute a callback on each page.
        :param repos_list: the list of repos
        :param callback: the callback to execute on each page (result: list, params: dict) -> None
        :param query: the query to filter pulls on GitHub pulls page (e.g. "is:pr")
        """
        url = f"{self._baseurl}/pulls"
        queries = [
            {
                "owner": name_with_owner.split("/")[0],
                "name": name_with_owner.split("/")[1],
                "query": query,
                "fromPage": 1,
                "maxPages": self._max_pages,
            }
            for name_with_owner in repos_list
        ]

        self.get_all_with_callback(url, queries, callback)

    def get_issues_with_callback(
        self, issues_list: List[Tuple[str, int]], callback: Callable[[Dict, Dict], Any]
    ) -> None:
        """
        fetch a repo's issue and execute a callback on it.
        :param issues_list: the list of issues [(repo, number)]
        :param number: the issue number to fetch
        :param callback: the callback to execute on the issue (result: dict, params: dict) -> None
        """
        url = f"{self._baseurl}/issue"
        queries = [
            {
                "owner": name_with_owner.split("/")[0],
                "name": name_with_owner.split("/")[1],
                "id": number,
            }
            for name_with_owner, number in issues_list
        ]

        self.get_all_with_callback(url, queries, callback)

    def get_pulls_with_callback(
        self, pulls_list: List[Tuple[str, int]], callback: Callable[[Dict, Dict], Any]
    ) -> None:
        """
        fetch a repo's pull request and execute a callback on it.
        :param pulls_list: the list of pulls [(repo, number)]
        :param number: the pull request number to fetch
        :param callback: the callback to execute on the pull request (result: dict, params: dict) -> None
        """
        url = f"{self._baseurl}/pull"
        queries = [
            {
                "owner": name_with_owner.split("/")[0],
                "name": name_with_owner.split("/")[1],
                "id": number,
            }
            for name_with_owner, number in pulls_list
        ]
        self.get_all_with_callback(url, queries, callback)


if __name__ == "__main__":
    # an example to collect PR bodies
    from configparser import ConfigParser
    import pandas as pd

    # parse config file
    config = ConfigParser()
    config.read("config.ini")

    # create a github scraper
    scraper = GithubScraperClient(
        baseurl=config["Scraper"]["addr"], auth=config["Scraper"]["auth"]
    )

    df_projects = pd.read_csv("cache/df_valid_temp.csv").sample(10)
    name_with_owner = df_projects["name_with_owner"].tolist()
    pr_number = df_projects["id"].tolist()
    queries = [(nam, pr) for nam, pr in zip(name_with_owner, pr_number)]
    print(queries)

    # callback save the results (in this case, the body of the PR)
    def callback(results: list, params: dict) -> None:
        if len(results) == 0:
            return
        print(params["name"], results[-1])

    # fetch the PR bodies
    scraper.get_pulls_with_callback(queries, callback)
    # fetch issues
    scraper.get_issue_lists_with_callback(name_with_owner, callback)
