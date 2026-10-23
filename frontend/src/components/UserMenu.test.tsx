import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "@/components/UserMenu";

const stubFetch = (status: number) => {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ status: "ok" }), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const openSettings = async () => {
  await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
  await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
  return screen.getByRole("dialog", { name: /account settings/i });
};

describe("UserMenu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the username and logs out from the menu", async () => {
    const onLogout = vi.fn();
    render(<UserMenu username="alice" onLogout={onLogout} />);
    expect(screen.getByRole("button", { name: /account menu/i })).toHaveTextContent("alice");
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("opens and closes account settings", async () => {
    render(<UserMenu username="alice" onLogout={() => {}} />);
    const dialog = await openSettings();
    expect(dialog).toHaveTextContent("Signed in as alice");
    await userEvent.click(screen.getByRole("button", { name: /close account settings/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("changes the password", async () => {
    const fetchMock = stubFetch(200);
    render(<UserMenu username="alice" onLogout={() => {}} />);
    await openSettings();
    await userEvent.type(screen.getByLabelText(/current password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/new password/i), "newsecret1");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(screen.getByLabelText(/current password/i)).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ current_password: "secret123", new_password: "newsecret1" }),
      })
    );
  });

  it.each([
    [400, /password is incorrect/i],
    [422, /at least 8 characters/i],
  ])("shows an error when changing the password fails with %i", async (status, message) => {
    stubFetch(status);
    render(<UserMenu username="alice" onLogout={() => {}} />);
    await openSettings();
    await userEvent.type(screen.getByLabelText(/current password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/new password/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(message);
  });

  it("deletes the account and signs out", async () => {
    const fetchMock = stubFetch(200);
    const onLogout = vi.fn();
    render(<UserMenu username="alice" onLogout={onLogout} />);
    await openSettings();
    await userEvent.type(screen.getByLabelText(/confirm with password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(onLogout).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ password: "secret123" }) })
    );
  });

  it("keeps the account when the delete password is wrong", async () => {
    stubFetch(400);
    const onLogout = vi.fn();
    render(<UserMenu username="alice" onLogout={onLogout} />);
    await openSettings();
    await userEvent.type(screen.getByLabelText(/confirm with password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/password is incorrect/i);
    expect(onLogout).not.toHaveBeenCalled();
  });
});
