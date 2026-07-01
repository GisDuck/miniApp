import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";
import "./TextButton.css";

type TextButtonStyle = CSSProperties & {
  "--text-button-color"?: string;
  "--text-button-border-color"?: string;
  "--text-button-fill"?: string;
  "--text-button-font-size"?: string;
  "--text-button-disabled-fill"?: string;
};

type TextButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  textColor?: string;
  borderColor?: string;
  fillColor?: string;
  fontSize?: string;
  disabledFillColor?: string;
  fullWidth?: boolean;
  centerWidth?: boolean;
  children: ReactNode;
};

export function TextButton({
  className,
  textColor,
  borderColor,
  fillColor,
  fontSize,
  disabledFillColor,
  fullWidth = false,
  centerWidth = false,
  style,
  children,
  ...buttonProps
}: TextButtonProps) {
  const buttonStyle: TextButtonStyle = {
    ...style,
  };

  if (textColor) {
    buttonStyle["--text-button-color"] = textColor;
  }

  if (borderColor) {
    buttonStyle["--text-button-border-color"] = borderColor;
  }

  if (fillColor) {
    buttonStyle["--text-button-fill"] = fillColor;
  }

  if (fontSize) {
    buttonStyle["--text-button-font-size"] = fontSize;
  }

  if (disabledFillColor) {
    buttonStyle["--text-button-disabled-fill"] = disabledFillColor;
  }

  const classNames = [
    "text-button",
    fullWidth ? "text-button--full-width" : "",
    centerWidth ? "text-button--center-width" : "",
    disabledFillColor ? "text-button--disabled-fill" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classNames} style={buttonStyle} {...buttonProps}>
      {children}
    </button>
  );
}
