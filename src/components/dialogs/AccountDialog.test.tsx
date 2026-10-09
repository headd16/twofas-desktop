// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect, beforeAll, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { AccountDialog } from "./AccountDialog";
const save = vi.hoisted(() => vi.fn());
vi.mock("../../services/native", () => ({ native: { save } }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  save.mockReset();
});
it("submits a real manual account through the native boundary and closes after saving", async () => {
  save.mockResolvedValue(undefined);
  const saved = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  render(<AccountDialog onClose={close} onSaved={saved} onMove={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Service / issuer"), "GitHub");
  await userEvent.type(screen.getByLabelText("Account name"), "alice");
  await userEvent.type(
    screen.getByLabelText("Base32 secret"),
    "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add account" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        issuer: "GitHub",
        name: "alice",
        kind: "totp",
        algorithm: "SHA1",
        period: 30,
        digits: 6,
      }),
      undefined,
    ),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(saved).toHaveBeenCalledOnce();
});
it("shows backend validation errors without dismissing the account form", async () => {
  save.mockRejectedValue("Secret must be valid Base32");
  const close = vi.fn();
  render(<AccountDialog onClose={close} onSaved={vi.fn()} onMove={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("Account name"), "alice");
  await userEvent.type(screen.getByLabelText("Base32 secret"), "INVALID!");
  await userEvent.click(screen.getByRole("button", { name: "Add account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Secret must be valid Base32",
  );
  expect(close).not.toHaveBeenCalled();
});
