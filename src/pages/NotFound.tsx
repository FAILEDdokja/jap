import { Link } from "react-router-dom";
import { Button } from "@/components/ui/primitives";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-card">
        <Wordmark className="justify-center" />
        <p className="mt-6 text-5xl font-bold tracking-tight text-zinc-100">404</p>
        <p className="mt-2 text-sm text-zinc-400">
          That page isn't part of the workspace, or the record moved.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/app"><Button>Go to dashboard</Button></Link>
          <Link to="/"><Button variant="secondary">Home</Button></Link>
        </div>
      </div>
    </div>
  );
}
