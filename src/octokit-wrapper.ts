import { Octokit } from "octokit";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

export class OctokitWrapper {
  private readonly octokit: Octokit;
  private currentUser:
    | RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]
    | undefined;

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
  ): Promise<RestEndpointMethodTypes["search"]["code"]["response"]> {
    return await this.octokit.rest.search.code({
      q: `org:${org} filename:cgmanifest.json`,
      per_page: 1,
    });
  }
}
