import dotenv from "dotenv";
import { Octokit } from "octokit";
import type { PullRequest } from "@octokit/graphql-schema";
import signale from "signale";

dotenv.config();

const octokit = new Octokit({
  auth: process.env["GITHUB_TOKEN"],
});
const currentUser = await octokit.rest.users.getAuthenticated();

const searchResults = await octokit.paginate(
  octokit.rest.search.issuesAndPullRequests,
  {
    q: `is:pr author:${currentUser.data.login} user:JamieMagee in:title "cgmanifest.json"`,
    order: "desc",
    sort: "updated",
  }
);

const summary: { merged: number; open: number; closed: number } = {
  merged: 0,
  open: 0,
  closed: 0,
};

for (const searchResult of searchResults) {
  const { node } = await octokit.graphql<{ node: PullRequest }>(
    `query {
      node(id:"${searchResult.node_id}") {
        ... on PullRequest {
          url
          state
          merged
        }
      }
    }`
  );
  switch (node.state) {
    case "OPEN":
      summary.open++;
      signale.info(`${node.url} is open`);
      break;
    case "CLOSED":
      switch (node.merged) {
        case true:
          summary.merged++;
          signale.success(`${node.url} is merged`);
          break;
        case false:
          summary.closed++;
          signale.error(`${node.url} is closed`);
          break;
      }
      break;
  }
}

signale.success(`merged: ${summary.merged}`);
signale.pending(`open: ${summary.open}`);
signale.error(`closed: ${summary.closed}`);
