import en from "../locales/en.json";
import zh from "../locales/zh-CN.json";
let locale = "zh-CN";
export const setLocale = (next: string) => {
  locale = next;
};
export function t(
  key: string,
  args: Record<string, string | number | undefined> = {},
) {
  let value =
    ((locale === "en" ? en : zh) as Record<string, string>)[key] ?? key;
  for (const [name, text] of Object.entries(args))
    value = value.replaceAll("{" + name + "}", String(text ?? ""));
  return value;
}
