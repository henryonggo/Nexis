import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

/** next-intl request config (no i18n routing — locale comes from a cookie). */
export default getRequestConfig(async () => {
  const locale = getUserLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
