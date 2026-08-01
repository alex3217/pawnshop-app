import { useState } from "react";
import type { InputHTMLAttributes } from "react";

import "../styles/password-input.css";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  visibilityLabel?: string;
};

export default function PasswordInput({
  className,
  disabled,
  id,
  visibilityLabel = "password",
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = visible ? "Hide" : "Show";

  return (
    <div className="password-input">
      <input
        {...inputProps}
        id={id}
        className={className}
        disabled={disabled}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-controls={id}
        aria-label={`${action} ${visibilityLabel}`}
        aria-pressed={visible}
        disabled={disabled}
      >
        {action}
      </button>
    </div>
  );
}
