import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

function Toggle() {
  const { resolved, toggle, setPreference } = useTheme();
  return (
    <>
      <output data-testid="theme">{resolved}</output>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setPreference("system")}>system</button>
    </>
  );
}

afterEach(() => document.documentElement.classList.remove("dark"));

describe("theme", () => {
  it("toggles dark mode on <html> and remembers the choice", () => {
    render(<ThemeProvider><Toggle /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("light");
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("qk-theme")).toBe("dark");
  });

  it("restores a saved preference and can return to following the system", () => {
    localStorage.setItem("qk-theme", "dark");
    render(<ThemeProvider><Toggle /></ThemeProvider>);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    act(() => { fireEvent.click(screen.getByText("system")); });
    expect(localStorage.getItem("qk-theme")).toBeNull();
    expect(screen.getByTestId("theme").textContent).toBe("light"); // jsdom has no dark system preference
  });
});
