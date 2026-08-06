import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "../../src/client/components/ui";
import { SetupScreen } from "../../src/client/features/auth/SetupScreen";
import { LoginScreen } from "../../src/client/features/auth/LoginScreen";

function wrap(node: React.ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

describe("auth screens", () => {
  it("renders first-run setup", () => {
    wrap(<SetupScreen onDone={() => {}} />);
    expect(screen.getByText("Set up your board")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("blocks setup when passwords do not match", async () => {
    const onDone = vi.fn();
    wrap(<SetupScreen onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Username"), "admin");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.type(screen.getByLabelText("Confirm password"), "different999");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("renders login", () => {
    wrap(<LoginScreen onDone={() => {}} />);
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
