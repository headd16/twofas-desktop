// @vitest-environment jsdom
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { App } from "./App";
const mock = vi.hoisted(() => ({
  status: vi.fn(),
  accounts: vi.fn(),
  codes: vi.fn(),
  copy: vi.fn(),
  activity: vi.fn(),
  unlock: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../services/native", () => ({ native: mock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    close: vi.fn(),
    toggleMaximize: vi.fn(),
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
function setup(locked = false) {
  mock.status.mockResolvedValue({
    locked,
    password_set: locked,
    settings: {
      privacy_mode: false,
      sort: "manual",
      clipboard_seconds: 30,
      lock_seconds: 300,
      startup: false,
      tray: true,
      always_on_top: false,
    },
  });
  mock.accounts.mockResolvedValue([
    {
      id: "1",
      issuer: "GitHub",
      name: "alice",
      kind: "totp",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      counter: 0,
      favorite: false,
      position: 0,
      icon: "auto",
    },
  ]);
  mock.codes.mockResolvedValue([
    { id: "1", code: "123456", remaining: 24, period: 30 },
  ]);
  mock.copy.mockResolvedValue(undefined);
  mock.activity.mockResolvedValue(undefined);
}
it("shows native codes, copies through native IPC, and filters accounts", async () => {
  setup();
  render(<App />);
  await screen.findByText("123 456");
  await userEvent.click(
    screen.getByRole("button", { name: "Copy GitHub code" }),
  );
  await waitFor(() => expect(mock.copy).toHaveBeenCalledWith("1"));
  await screen.findByText("Code copied");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Search tokens" }),
    "does not exist",
  );
  expect(screen.getByText("No matching tokens")).toBeInTheDocument();
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
});
it("blocks code and metadata requests while locked", async () => {
  setup(true);
  render(<App />);
  await screen.findByText("Vault locked");
  expect(mock.accounts).not.toHaveBeenCalled();
  expect(mock.codes).not.toHaveBeenCalled();
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
});
it("renders settings and real security controls", async () => {
  setup();
  render(<App />);
  await screen.findByText("123 456");
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByText("Set app password")).toBeInTheDocument();
  expect(screen.getByText("Export encrypted backup")).toBeInTheDocument();
});

function setupPrivacy() {
  setup();
  const status = mock.status.getMockImplementation()!();
  mock.status.mockImplementation(async () => ({
    ...(await status),
    settings: { ...(await status).settings, privacy_mode: true },
  }));
  mock.codes.mockImplementation(async (ids: string[] = []) => [
    {
      id: "1",
      code: ids.includes("1") ? "123456" : "",
      remaining: 24,
      period: 30,
    },
  ]);
}
it("privacy mode hides codes, copies without reveal, and hides on focus loss", async () => {
  setupPrivacy();
  render(<App />);
  await screen.findByRole("button", { name: "Reveal GitHub code" });
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
  expect(mock.codes).toHaveBeenCalledWith([]);
  await userEvent.click(
    screen.getByRole("button", { name: "Copy GitHub code" }),
  );
  expect(mock.copy).toHaveBeenCalledWith("1");
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Reveal GitHub code" }),
  );
  await screen.findByText("123 456");
  expect(mock.codes).toHaveBeenCalledWith(["1"]);
  fireEvent(window, new Event("blur"));
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
});
it("revealed code expires after ten seconds and is absent from the DOM", async () => {
  setupPrivacy();
  render(<App />);
  await screen.findByRole("button", { name: "Reveal GitHub code" });
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reveal GitHub code" }));
  });
  expect(screen.getByText("123 456")).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Reveal GitHub code" }),
  ).toBeInTheDocument();
});

it("hides codes immediately while the privacy preference is being saved", async () => {
  setup();
  let finish!: () => void;
  mock.settings.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<App />);
  await screen.findByText("123 456");
  await userEvent.click(screen.getByRole("button", { name: "Privacy mode" }));
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Privacy mode" })).toHaveAttribute("aria-pressed", "true");
  const previousStatus = await mock.status.getMockImplementation()!();
  mock.status.mockResolvedValue({ ...previousStatus, settings: { ...previousStatus.settings, privacy_mode: true } });
  await act(async () => { finish(); });
  expect(screen.queryByText("123 456")).not.toBeInTheDocument();
});
