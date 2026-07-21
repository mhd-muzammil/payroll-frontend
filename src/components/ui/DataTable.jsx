// Columns whose content is a row of buttons rather than a value. On mobile
// these are pulled out of the label/value grid and shown as a footer strip.
const isActionColumn = (c) => c.key === "act" || !c.label;

const DataTable = ({ columns, data, emptyMessage = "No records found." }) => {
  const [primary, ...rest] = columns;
  const detailColumns = rest.filter((c) => !isActionColumn(c));
  const actionColumns = rest.filter(isActionColumn);

  return (
    <div className="glass-card rounded-3xl overflow-hidden">
      {/* Desktop / tablet: classic table */}
      <div className="hidden md:block overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`text-left font-medium text-muted-foreground px-5 py-3.5 text-xs uppercase tracking-wider ${c.className || ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr className="border-t border-border">
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/40 transition">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-5 py-4 ${c.className || ""}`}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row, so nothing needs horizontal scrolling */}
      <div className="md:hidden divide-y divide-border">
        {data.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          data.map((row, i) => (
            <div key={i} className="p-4 space-y-3">
              {primary && (
                <div className="min-w-0">
                  {primary.render ? primary.render(row) : row[primary.key]}
                </div>
              )}

              {detailColumns.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  {detailColumns.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {c.label}
                      </dt>
                      <dd className="mt-0.5 text-sm break-words">
                        {c.render ? c.render(row) : row[c.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {actionColumns.length > 0 && (
                // Bump the small icon buttons up to a comfortable tap target
                // (>=40px) on touch screens without touching every call site.
                <div className="flex flex-wrap items-center gap-2 pt-1 [&_button]:h-10 [&_button]:min-w-10 [&_button]:px-3">
                  {actionColumns.map((c) => (
                    <div key={c.key} className="min-w-0">
                      {c.render ? c.render(row) : row[c.key]}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DataTable;
