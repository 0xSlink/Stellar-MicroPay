import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingTour from "@/components/OnboardingTour";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

function addTourTargets() {
  document.body.innerHTML = `
    <div class="balance-card"></div>
    <div class="send-payment-form"></div>
    <a href="/transactions"></a>
  `;
}

describe("OnboardingTour", () => {
  beforeEach(() => {
    addTourTargets();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    if (originalScrollIntoView) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoView,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("renders the first step and disables Back at the first-step boundary", () => {
    render(
      <OnboardingTour
        isVisible
        onComplete={jest.fn()}
        onSkip={jest.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your Balance" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Here you can see your XLM balance and wallet address. This is your main account overview.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(document.querySelector(".balance-card")).toHaveClass("tour-highlight");
  });

  it("advances to the next step without completing before the final step", async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();

    render(
      <OnboardingTour isVisible onComplete={onComplete} onSkip={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Send Payments" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("returns to the previous step and keeps the first-step boundary disabled", async () => {
    const user = userEvent.setup();

    render(
      <OnboardingTour
        isVisible
        onComplete={jest.fn()}
        onSkip={jest.fn()}
      />,
    );

    const backButton = screen.getByRole("button", { name: "Back" });
    expect(backButton).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(backButton);

    expect(screen.getByRole("heading", { name: "Your Balance" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(backButton).toBeDisabled();
  });

  it("calls onSkip and does not call onComplete when skipped", async () => {
    const user = userEvent.setup();
    const onSkip = jest.fn();
    const onComplete = jest.fn();

    render(
      <OnboardingTour
        isVisible
        onComplete={onComplete}
        onSkip={onSkip}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Skip tour" }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("calls onComplete only after advancing through the final step", async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();

    render(
      <OnboardingTour
        isVisible
        onComplete={onComplete}
        onSkip={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "View Transactions" })).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not render when hidden or when the current step target is missing", () => {
    const callbacks = { onComplete: jest.fn(), onSkip: jest.fn() };
    const { rerender, container } = render(
      <OnboardingTour isVisible={false} {...callbacks} />,
    );
    expect(container).toBeEmptyDOMElement();

    document.querySelector(".balance-card")?.remove();
    rerender(<OnboardingTour isVisible {...callbacks} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does not advance beyond the final step after repeated Next actions", async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();

    render(
      <OnboardingTour
        isVisible
        onComplete={onComplete}
        onSkip={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "View Transactions" })).toBeInTheDocument();
  });
});
