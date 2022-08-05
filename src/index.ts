import fetch from "node-fetch";
import dotenv from "dotenv";
import { Octokit } from "octokit";
import prettier from "prettier";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import signale from "signale";
import { OctokitWrapper } from "./octokit-wrapper";

dotenv.config();
const octokitWrapper = await OctokitWrapper.create(
  process.env["GITHUB_TOKEN"]!
);
const { data: response } = await octokitWrapper.getRepositoriesWithCgmanifest();
signale.info(`Found ${response.items.length} repositories`);

for (const result of response.items) {
  // Fork the repository
  const logger = signale.scope(
    `${result.repository.owner.login}/${result.repository.name}`
  );
  logger.log(
    `Forking to ${octokitWrapper.getCurrentUser()}/${result.repository.name}`
  );
  const fork = await octokit.rest.repos.createFork({
    owner: result.repository.owner.login,
    repo: result.repository.name,
  });

  // Get cgmanifest.json
  logger.log(`Getting cgmanifest.json`);
  const content = await octokit.rest.repos.getContent({
    owner: fork.data.owner.login,
    repo: fork.data.name,
    path: result.path,
  });
  const parsedContent = JSON.parse(
    // @ts-ignore
    Buffer.from(content.data.content, "base64").toString()
  );

  // Update cgmanifest.json
  logger.log(`Updating cgmanifest.json`);
  parsedContent["$schema"] =
    "https://json.schemastore.org/component-detection-manifest.json";
  const prettierContent = prettier.format(JSON.stringify(parsedContent), {
    parser: "json",
    plugins: ["prettier-plugin-sort-json"],
  });

  // get the latest commit on default branch
  const defaultBranch = await octokit.rest.repos.getBranch({
    owner: fork.data.owner.login,
    repo: fork.data.name,
    branch: fork.data.default_branch,
  });
  logger.log(`Default branch: ${defaultBranch.data.name}`);

  const branchName = "cgmanifest-schema";
  try {
    // delete existing branch
    logger.log(`Deleting existing branch ${branchName} (if exists)`);
    await octokit.rest.git.deleteRef({
      owner: fork.data.owner.login,
      repo: fork.data.name,
      ref: `heads/${branchName}`,
      request: {
        fetch, // Bug with Node.js built-in fetch
      },
    });
  } catch (e) {
    // branch doesn't exist
    logger.log(`Branch ${branchName} doesn't exist`);
  }

  // Create a new branch from the latest commit on the default branch
  logger.log(`Creating new branch ${branchName}`);
  const branch = await octokit.rest.git.createRef({
    owner: fork.data.owner.login,
    repo: fork.data.name,
    ref: `refs/heads/${branchName}`,
    sha: defaultBranch.data.commit.sha,
  });

  // Update cgmanifest.json
  logger.log(`Updating cgmanifest.json`);
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: fork.data.owner.login,
    repo: fork.data.name,
    branch: branch.data.ref,
    // @ts-ignore
    sha: content.data.sha,
    content: Buffer.from(prettierContent).toString("base64"),
    path: result.path,
    message: "Add $schema to cgmanifest.json",
  });

  // Create a pull request
  logger.log(`Creating pull request`);
  const pullRequestBody = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "./pull-request-body.md"
    ),
    "utf8"
  );
  const pullRequest = await octokit.rest.pulls.create({
    owner: fork.data.owner.login,
    repo: fork.data.name,
    head: branch.data.ref,
    base: fork.data.default_branch,
    title: "Add $schema to cgmanifest.json",
    body: pullRequestBody,
  });

  logger.success(`Pull request created: ${pullRequest.data.html_url}`);
}
