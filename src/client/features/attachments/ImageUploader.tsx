import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../components/ui";

type Status = "idle" | "uploading";

export function ImageUploader({
  cardId,
  onUploaded,
}: {
  cardId: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Array<{ filename: string; error: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setStatus("uploading");
    setProgress(30);
    setFailed([]);
    try {
      const result = await api.uploadAttachments(cardId, files);
      setProgress(100);
      if (result.errors.length > 0) {
        setFailed(result.errors);
        toast.push(`${result.errors.length} file(s) could not be uploaded.`, "error");
      }
      if (result.attachments.length > 0) {
        toast.push(`Added ${result.attachments.length} image(s).`);
        await onUploaded();
      }
    } catch {
      toast.push("Upload failed.", "error");
    } finally {
      setStatus("idle");
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mw-stack" style={{ gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => void upload([...(e.target.files ?? [])])}
      />
      <button
        className="mw-btn mw-btn--ghost mw-btn--sm"
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
      >
        {status === "uploading" ? (
          "Uploading…"
        ) : (
          <>
            <ImagePlus size={15} strokeWidth={1.75} /> Upload images
          </>
        )}
      </button>

      {status === "uploading" && (
        <div className="mw-uploader__progress" aria-hidden="true">
          <div className="mw-uploader__bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {failed.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--mw-danger)", fontSize: 12.5 }}>
          {failed.map((f) => (
            <li key={f.filename}>
              {f.filename}: {f.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
