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
        ? jsonResponse(200, { id: 1, username: "user" })
        : jsonResponse(401, { detail: "Not signed in" });
    }
    if (url === "/api/login") {
      const { username, password } = JSON.parse(init?.body as string);
      return username === "user" && password === "password"
        ? jsonResponse(200, { id: 1, username })
        : jsonResponse(401, { detail: "Invalid credentials" });
    }
    if (url === "/api/register") {
      const { username } = JSON.parse(init?.body as string);
      return username === "user"
        ? jsonResponse(409, { detail: "Username is taken" })
        : username.length < 3
          ? jsonResponse(422, { detail: "Invalid" })
          : jsonResponse(201, { id: 2, username });
    }
    if (url === "/api/boards") {
      return jsonResponse(200, [{ id: "board-1", name: "My Board" }]);
    }
    if (url === "/api/boards/board-1") {
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
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByRole("button", { name: /switch board/i })).toHaveTextContent("My Board");
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
    await userEvent.click(await screen.findByRole("button", { name: /account menu/i }));
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });

  describe("registration", () => {
    const register = async (username: string, password: string, confirm = password) => {
      await userEvent.click(
        await screen.findByRole("button", { name: /create an account/i })
      );
      await userEvent.type(screen.getByLabelText(/username/i), username);
      await userEvent.type(screen.getByLabelText(/^password/i), password);
      await userEvent.type(screen.getByLabelText(/confirm password/i), confirm);
      await userEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    };

    it("creates an account and shows the board", async () => {
      const fetchMock = mockFetch(false);
      render(<App />);
      await register("alice", "secret123");
      expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/register",
        expect.objectContaining({ method: "POST" })
      );
      await userEvent.click(screen.getByRole("button", { name: /account menu/i }));
      expect(screen.getByRole("button", { name: /account menu/i })).toHaveTextContent("alice");
    });

    it("rejects mismatched passwords without calling the server", async () => {
      const fetchMock = mockFetch(false);
      render(<App />);
      await register("alice", "secret123", "different1");
      expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
      expect(fetchMock).not.toHaveBeenCalledWith("/api/register", expect.anything());
    });

    it("shows when the username is taken", async () => {
      mockFetch(false);
      render(<App />);
      await register("user", "secret123");
      expect(await screen.findByRole("alert")).toHaveTextContent(/taken/i);
    });

    it("explains the rules on invalid input", async () => {
      mockFetch(false);
      render(<App />);
      await register("al", "secret123");
      expect(await screen.findByRole("alert")).toHaveTextContent(/3-32/);
    });

    it("can switch back to sign in", async () => {
      mockFetch(false);
      render(<App />);
      await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /have an account/i }));
      expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    });
  });
});
