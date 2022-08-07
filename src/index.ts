import dotenv from "dotenv";
import prettier from "prettier";
import signale from "signale";
import { OctokitWrapper } from "./octokit-wrapper.js";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

dotenv.config();
const octokitWrapper = await OctokitWrapper.create(
  process.env["GITHUB_TOKEN"]!
);

signale.info("Fetching repositories with cgmanifest...");
const results = await octokitWrapper.getRepositoriesWithCgmanifest();
signale.info(`Found ${results.length} repositories`);

for (const result of results) {
  // Fork the repository
  const logger = signale.scope(
    `${result.repository.owner.login}/${result.repository.name}`
  );

  // Check if the repository is archived or private
  if (
    await octokitWrapper.isRepositoryArchivedOrPrivate(
      result.repository.owner.login,
      result.repository.name
    )
  ) {
    logger.warn("Repository is archived or private. Skipping...");
    continue;
  }

  let fork: RestEndpointMethodTypes["repos"]["get"]["response"];
  // Check if the fork already exists
  if (
    !(await octokitWrapper.forkExists(
      result.repository.owner.login,
      result.repository.name
    ))
  ) {
    logger.log(
      `Forking to ${octokitWrapper.getCurrentUser()}/${result.repository.name}`
    );
    // Create the fork
    fork = await octokitWrapper.createFork(
      result.repository.owner.login,
      result.repository.name
    );
  } else {
    logger.log(
      `Fork already exists ${octokitWrapper.getCurrentUser()}/${
        result.repository.name
      }`
    );
    // Get the fork
    fork = await octokitWrapper.getRepository(
      octokitWrapper.getCurrentUser(),
      result.repository.name
    );
  }

  // Check if the fork has a pull request back to the original repository
  if (
    await octokitWrapper.pullRequestExists(
      fork.data.owner.login,
      fork.data.name
    )
  ) {
    logger.log(
      `Pull request already exists ${octokitWrapper.getCurrentUser()}/${
        result.repository.name
      }`
    );
    // Skip the repository
    continue;
  }

  // Get cgmanifest.json
  logger.log(`Getting cgmanifest.json`);
  const cgManifest = await octokitWrapper.getCgmanifest(
    fork.data.owner.login,
    fork.data.name,
    result.path
  );
  const content = JSON.parse(
    Buffer.from(cgManifest.content, "base64").toString()
  );

  // Update cgmanifest.json
  logger.log(`Updating cgmanifest.json`);
  content["$schema"] =
    "https://json.schemastore.org/component-detection-manifest.json";
  // Format the JSON with prettier
  const formattedContent = prettier.format(JSON.stringify(content), {
    parser: "json",
    plugins: ["prettier-plugin-sort-json"],
  });

  if (
    await octokitWrapper.branchExists(fork.data.owner.login, fork.data.name)
  ) {
    logger.warn("Founding branch already exists. Deleting...");
    await octokitWrapper.deleteBranch(fork.data.owner.login, fork.data.name);
  }
  const defaultBranch = await octokitWrapper.getBranch(
    fork.data.owner.login,
    fork.data.name,
    fork.data.default_branch
  );

  logger.log("Creating 'cgmanifest-schema' branch");
  await octokitWrapper.createBranch(
    fork.data.owner.login,
    fork.data.name,
    defaultBranch.data.object.sha
  );

  // Update cgmanifest.json
  logger.log(`Updating cgmanifest.json`);
  await octokitWrapper.updateCgmanifest(
    fork.data.owner.login,
    fork.data.name,
    formattedContent,
    result.path,
    cgManifest.sha
  );

  // Create a pull request
  logger.log(`Creating pull request`);
  const pullRequest = await octokitWrapper.createPullRequest(
    fork.data.owner.login,
    fork.data.name,
    fork.data.default_branch
  );

  logger.success(`Pull request created: ${pullRequest.data.html_url}`);
}
