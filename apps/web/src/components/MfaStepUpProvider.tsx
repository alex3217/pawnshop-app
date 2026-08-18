import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { setMfaStepUpPrompt, type MfaStepUpInput, type MfaStepUpMethod } from "../services/mfaStepUp";

type Pending = {
  scope: string;
  resolve: (input: MfaStepUpInput) => void;
  reject: (error: Error) => void;
};

export default function MfaStepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [method, setMethod] = useState<MfaStepUpMethod>("totp");
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Pending | null>(null);

  useEffect(() => {
    setMfaStepUpPrompt((scope) => new Promise((resolve, reject) => {
      if (pendingRef.current) {
        reject(new Error("Another privileged authentication request is already in progress"));
        return;
      }
      setMethod("totp");
      setCode("");
      const request = { scope, resolve, reject };
      pendingRef.current = request;
      setPending(request);
    }));
    return () => {
      setMfaStepUpPrompt(null);
      pendingRef.current?.reject(new Error("Privileged authentication was cancelled"));
      pendingRef.current = null;
    };
  }, []);

  useEffect(() => { if (pending) inputRef.current?.focus(); }, [pending, method]);

  function cancel() {
    pending?.reject(new Error("Privileged authentication was cancelled"));
    pendingRef.current = null;
    setPending(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending || !code.trim()) return;
    pending.resolve({ method, code: code.trim() });
    pendingRef.current = null;
    setPending(null);
  }

  return <>
    {children}
    {pending ? <div className="mfa-step-up-backdrop" role="presentation">
      <section className="mfa-step-up-dialog" role="dialog" aria-modal="true" aria-labelledby="mfa-step-up-title">
        <h2 id="mfa-step-up-title">Confirm this sensitive action</h2>
        <p>Enter a fresh MFA code for <code>{pending.scope}</code>. The proof is short-lived and used once.</p>
        <form onSubmit={submit}>
          <label>Verification method
            <select value={method} onChange={(event) => { setMethod(event.target.value as MfaStepUpMethod); setCode(""); }}>
              <option value="totp">Authenticator code</option>
              <option value="recovery_code">Recovery code</option>
            </select>
          </label>
          <label>{method === "totp" ? "Six-digit code" : "Recovery code"}
            <input ref={inputRef} required inputMode={method === "totp" ? "numeric" : "text"} pattern={method === "totp" ? "[0-9]{6}" : undefined} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <div className="mfa-step-up-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
            <button type="submit" className="btn btn-primary">Verify and continue</button>
          </div>
        </form>
      </section>
    </div> : null}
  </>;
}
