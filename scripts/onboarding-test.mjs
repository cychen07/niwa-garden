export async function suppressOnboarding(context) {
  await context.addInitScript(({ key }) => {
    const now = new Date();
    const day = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    localStorage.setItem(key, day);
  }, { key: "niwa-onboarding-day-v1" });
}
