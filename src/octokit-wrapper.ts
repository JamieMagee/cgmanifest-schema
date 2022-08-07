import { Octokit } from "octokit";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import type { components } from "@octokit/openapi-types";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

export class OctokitWrapper {
  private readonly octokit: Octokit;
  private currentUser:
    | RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]
    | undefined;

  private static readonly PullRequestTitle =
    "Add `$schema` to `cgmanifest.json`";
  private static readonly BranchName = "cgmanifest-schema";

  private constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  public static async create(token: string): Promise<OctokitWrapper> {
    const instance = new OctokitWrapper(token);
    instance.currentUser = await instance.octokit.rest.users.getAuthenticated();
    return instance;
  }

  public getCurrentUser(): string {
    return this.currentUser?.data.login ?? "";
  }

  public async getRepositoriesWithCgmanifest(
    org: string = "microsoft"
  ): Promise<
    RestEndpointMethodTypes["search"]["code"]["response"]["data"]["items"]
  > {
    return (
      await this.octokit.paginate(this.octokit.rest.search.code, {
        q: `org:${org} filename:cgmanifest.json`,
      })
    ).sort((a, b) => a.repository.name.localeCompare(b.repository.name));
  }

  public async isRepositoryArchivedOrPrivate(
    owner: string,
    repo: string
  ): Promise<boolean> {
    const { data } = await this.octokit.rest.repos.get({
      owner,
      repo,
    });
    return data.archived || data.private;
  }

  public async forkExists(owner: string, repo: string): Promise<boolean> {
    const { data } = await this.octokit.rest.repos.listForks({
      owner,
      repo,
    });
    return (
      data.find((fork) => fork.owner.login === this.getCurrentUser()) !==
      undefined
    );
  }

  public async createFork(
    owner: string,
    repo: string
  ): Promise<RestEndpointMethodTypes["repos"]["get"]["response"]> {
    const { data } = await this.octokit.rest.repos.createFork({
      owner,
      repo,
    });
    return this.getRepository(data.owner.login, data.name);
  }

  public async getRepository(
    owner: string,
    repo: string
  ): Promise<RestEndpointMethodTypes["repos"]["get"]["response"]> {
    return await this.octokit.rest.repos.get({
      owner,
      repo,
    });
  }

  public async getCgmanifest(
    owner: string,
    repo: string,
    path: string
  ): Promise<components["schemas"]["content-file"]> {
    const { data } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });
    if ("content" in data) {
      return data;
    }
    throw new Error("No cgmanifest.json found");
  }

  public async pullRequestExists(
    owner: string,
    repo: string
  ): Promise<boolean> {
    try {
      await this.getPullRequest(owner, repo);
      return true;
    } catch (e) {
      return false;
    }
  }

  public async getPullRequest(
    owner: string,
    repo: string
  ): Promise<RestEndpointMethodTypes["pulls"]["get"]["response"]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
    });
    const pull_number = data.find(
      (pullRequest) =>
        pullRequest.title === OctokitWrapper.PullRequestTitle &&
        pullRequest.user?.login === this.getCurrentUser()
    )?.number;
    if (pull_number) {
      return await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });
    }
    throw new Error(
      `No pull request found in ${owner}/${repo} with title "${OctokitWrapper.PullRequestTitle}"`
    );
  }

  public async getBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<RestEndpointMethodTypes["git"]["getRef"]["response"]> {
    return this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
  }

  public async branchExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${OctokitWrapper.BranchName}`,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  public async deleteBranch(owner: string, repo: string): Promise<void> {
    await this.octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${OctokitWrapper.BranchName}`,
      request: {
        fetch, // workaround due to content-length header mismatch
      },
    });
  }

  public async createBranch(
    owner: string,
    repo: string,
    sha: string
  ): Promise<RestEndpointMethodTypes["git"]["createRef"]["response"]> {
    return this.octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${OctokitWrapper.BranchName}`,
      sha,
    });
  }

  public async updateCgmanifest(
    owner: string,
    repo: string,
    content: string,
    path: string,
    sha: string
  ): Promise<void> {
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      branch: `refs/heads/${OctokitWrapper.BranchName}`,
      content: Buffer.from(content).toString("base64"),
      sha,
      path,
      message: OctokitWrapper.PullRequestTitle,
      author: {
        name: "Jamie Magee",
        email: "jamie.magee@microsoft.com",
        date: new Date().toISOString(),
      },
    });
  }

  public async createPullRequest(
    owner: string,
    repo: string,
    base: string
  ): Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]> {
    const pullRequestBody = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "./pull-request-body.md"
      ),
      "utf8"
    );
    return this.octokit.rest.pulls.create({
      owner,
      repo,
      base,
      head: `${this.getCurrentUser()}:${OctokitWrapper.BranchName}`,
      title: OctokitWrapper.PullRequestTitle,
      body: pullRequestBody,
    });
  }
}
