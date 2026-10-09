// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect, afterEach, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SettingsPage } from "./SettingsPage";
import type { Status } from "../types";
const mock = vi.hoisted(() => ({ importPhoneBackup: vi.fn() }));
vi.mock("../services/native", () => ({ native: mock }));
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
  vi.resetAllMocks();
});
const status: Status = {
  locked: false,
  password_set: false,
  shortcut_available: true,
  settings: {
    privacy_mode: false,
    sort: "manual",
    clipboard_seconds: 30,
    lock_seconds: 300,
    startup: false,
    tray: true,
    always_on_top: false,
  },
};
async function open() {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  render(<SettingsPage status={status} onChange={onChange} notify={notify} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Import from phone (.2fas)" }),
  );
  return { onChange, notify };
}
it("imports a phone export without requiring a password and refreshes the vault", async () => {
  mock.importPhoneBackup.mockResolvedValue(2);
  const { onChange, notify } = await open();
  await userEvent.click(
    screen.getByRole("button", { name: "Choose phone export file" }),
  );
  await waitFor(() => expect(mock.importPhoneBackup).toHaveBeenCalledWith(""));
  expect(onChange).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith("Imported 2 phone accounts");
});
it("passes a phone password locally and keeps errors available for retry", async () => {
  mock.importPhoneBackup.mockRejectedValue(
    "Incorrect phone backup password or damaged file",
  );
  const { onChange } = await open();
  await userEvent.type(
    screen.getByLabelText("Phone export password (if encrypted)"),
    "test-password",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Choose phone export file" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Incorrect phone backup password",
  );
  expect(mock.importPhoneBackup).toHaveBeenCalledWith("test-password");
  expect(onChange).not.toHaveBeenCalled();
});
it("does not announce success after file selection is cancelled", async () => {
  mock.importPhoneBackup.mockResolvedValue(0);
  const { notify } = await open();
  await userEvent.click(
    screen.getByRole("button", { name: "Choose phone export file" }),
  );
  await waitFor(() => expect(mock.importPhoneBackup).toHaveBeenCalledOnce());
  expect(notify).not.toHaveBeenCalled();
});
