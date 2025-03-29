#!/usr/bin/env python3

# This example scrapes the dependents of the GitHub projects and saves them to CSV files

from typing import List, Dict
import pandas as pd
from github_scraper import GithubScraperClient

# TODO: Modify the following line if you want to use a proxy
PROXY_URL = "http://localhost:7890"  # or a http proxy url like "http://127.0.0.1:10080"


def get_project_list() -> List[Dict[str, str]]:
    """This function returns a list of projects to scrape"""
    project_list = [
        {
            "owner": "pandas-dev",
            "name": "pandas",
            "type": "REPOSITORY",
        },
        {
            "owner": "PaddlePaddle",
            "name": "Paddle",
            "type": "PACKAGE",
        },
        {
            "owner": "pytorch",
            "name": "pytorch",
            "type": "PACKAGE",
            "package_id": "UGFja2FnZS01MjY1MjIxNQ==",  # check package_id in the URL of the dependents page
        },
    ]
    ## or you can read the list from a csv file / dataframe
    return project_list


def callback(results, params):
    """
    The callback function
    """
    df = pd.DataFrame(results)
    df.to_csv(f"{params['owner']}_{params['name']}_{params['type']}.csv", index=False)


if __name__ == "__main__":
    # uncomment to show debug logs
    import logging

    logging.basicConfig(level=logging.DEBUG)

    scraper = GithubScraperClient(
        baseurl="http://scraper.12f23eddde.workers.dev/github",
        auth="OSSLab@PKU",
        num_workers=5,
        num_retries=5,
        proxy=PROXY_URL,
        log_level="DEBUG",
    )

    projects_list = get_project_list()
    print(
        f"Start scraping dependents: {len(projects_list)} projects, first 5: {projects_list[:5]}"
    )
    scraper.get_dependents_with_callback(projects_list, callback)
