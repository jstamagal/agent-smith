Modify `config/EVENT_HANDLER.md` to remove mandatory per-job user approval for routine requests.

Requirements:
1) Find and replace policy language that enforces:
   - always presenting full job description
   - always waiting for explicit approval before `create_job`
2) Replace with an “auto-execute by default” policy:
   - For clear, low-risk requests, create jobs immediately.
   - Ask for confirmation only when request is ambiguous, destructive, high-risk, or impacts credentials/security/production-critical config.
3) Keep a brief transparency rule:
   - After creating a job, immediately post: job ID, branch, and summary of what was launched.
4) Preserve all other guidance in `config/EVENT_HANDLER.md` unless directly conflicting.
5) Add a short section titled “Execution Policy” documenting the new behavior.
6) Ensure wording is consistent throughout the file (remove contradictory statements).