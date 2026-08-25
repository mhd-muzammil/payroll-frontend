import React from 'react'

/**
 * The header of most screens in the app, so it is where the brand lives.
 *
 * It used to be a heading and a line of grey text on white, which left every
 * screen looking like a spreadsheet and the brand nowhere. Now it is a panel in
 * the app's own gradient-brand hues, with the page's actions on it — the same
 * treatment the Hiring and Onboarding screens had each rolled by hand.
 *
 * Props are unchanged: every one of the twelve call sites keeps working without
 * being touched.
 */
const PageHeader = ({ title, description, actions }) => {
  return (
    <div className="mb-6 md:mb-8 -mx-4 rounded-b-3xl bg-gradient-to-br from-violet-700 via-indigo-900 to-slate-950 px-5 py-6 text-white shadow-lg sm:mx-0 sm:rounded-3xl sm:px-7 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1.5 text-sm text-violet-100/70 max-w-2xl">{description}</p>
          )}
        </div>
        {/* Buttons handed in by the page are styled for a light surface, so the
            panel lightens them here rather than making twelve screens pass
            different ones. */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 [&_button]:shadow-sm [&_.text-muted-foreground]:text-violet-100/70">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
