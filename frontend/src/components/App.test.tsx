import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import { boardData } from "@/test/boardData";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const mockFetch = (signedIn: boolean) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/me") {
      return signedIn
        ? jsonResponse(200, { username: "user" })
        : jsonResponse(401, { detail: "Not signed in" });
    }
    if (url === "/api/login") {
      const { username, password } = JSON.parse(init?.body as string);
      return username === "user" && password === "password"
        ? jsonResponse(200, { username })
        : jsonResponse(401, { detail: "Invalid credentials" });
    }
    if (url === "/api/board") {
      return jsonResponse(200, boardData);
    }
    return jsonResponse(200, { status: "ok" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const signIn = async (username: string, password: string) => {
  await userEvent.type(await screen.findByLabelText(/username/i), username);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when signed out", async () => {
    mockFetch(false);
    render(<App />);
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
  });

  it("shows the board when already signed in", async () => {
    mockFetch(true);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("shows an error for wrong credentials", async () => {
    mockFetch(false);
    render(<App />);
    await signIn("user", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid username or password/i);
    expect(screen.queryAllByTestId(/column-/i)).toHaveLength(0);
  });

  it("shows the board after signing in", async () => {
    mockFetch(false);
    render(<App />);
    await signIn("user", "password");
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("returns to the login form after logging out", async () => {
    const fetchMock = mockFetch(true);
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});
