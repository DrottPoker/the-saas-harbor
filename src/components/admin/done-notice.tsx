import { Notice } from "../shell";

const messages: Record<string, string> = {
  hidden: "Product hidden. The maker sees the reason and your explanation in their dashboard.",
  shown: "The product is shown again.",
  suspended:
    "Account suspended. The maker sees the reason and your explanation in their dashboard.",
  lifted: "The suspension is lifted.",
  dismissed: "Report dismissed. The reporter sees that no action was taken.",
};

/** Confirms the decision a form just saved. */
export function DoneNotice({ done }: { done: string | undefined }) {
  const message = done && Object.hasOwn(messages, done) ? messages[done] : null;
  return message ? (
    <Notice tone="success" className="mb-6">
      {message}
    </Notice>
  ) : null;
}
