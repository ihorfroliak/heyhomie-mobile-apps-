import React, { createContext, useContext, useState } from 'react';
import type { Locale } from '@heyhomie/domain';

interface LocaleContextValue {
    locale: Locale;
    setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => {} });

/** Wrap the app root so any screen can read/switch the language. */
export function LocaleProvider({ children, initial = 'en' }: { children: React.ReactNode; initial?: Locale }) {
    const [locale, setLocale] = useState<Locale>(initial);
    return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext).locale;
export const useSetLocale = (): ((l: Locale) => void) => useContext(LocaleContext).setLocale;
