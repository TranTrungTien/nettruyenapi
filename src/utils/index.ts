export { Story } from "./comic";
export { SSStory } from "./ssStory";

export async function randomDelay(min = 20, max = 100): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((res) => setTimeout(res, ms));
}