#!/usr/bin/env python3

# This example scrapes the dependents of the GitHub projects and saves them to CSV files

from typing import List, Dict
import pandas as pd
from github_scraper import GithubScraperClient

# TODO: Modify the following line if you want to use a proxy
PROXY_URL = None  # or a http proxy url like "http://127.0.0.1:10080"

def get_project_list() -> List[Dict[str, str]]:
    """TODO: Modify this function to return a list of projects to scrape"""
    project_list = [
        {
            "owner": "pandas-dev",
            "name": "pandas",
            "type": "REPOSITORY",
        },
        {
            "owner": "pandas-dev",
            "name": "pandas",
            "type": "PACKAGE",
        },
        {
            "owner": "facebook",
            "name": "react",
            "type": "PACKAGE",
            "package_id": "UGFja2FnZS01MDYxNzQ1MDM",
        }
    ]
    return project_list

def callback(results, params):
    """TODO: Modify this function if csv files are not what you want"""
    df = pd.DataFrame(results)
    df.to_csv(f"{params['owner']}_{params['name']}_{params['type']}.csv", index=False)

if __name__ == "__main__":
    scraper = GithubScraperClient(
        baseurl="https://scraper.12f23eddde.workers.dev/github", auth="OSSLab@PKU", num_workers=5, proxy=PROXY_URL
    )
    projects_list = get_project_list()
    print(f"Start scraping dependents: {len(projects_list)} projects, first 5: {projects_list[:5]}")
    scraper.get_dependents_with_callback(projects_list, callback)
