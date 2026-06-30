import { Filter, Download, Plus } from "lucide-react";
import {Button} from "./button";

const Toolbar = ({ search = true, onAdd, addLabel, searchValue, onSearchChange }) => {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {search && (
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <input
            value={searchValue || ""}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            placeholder="Search..."
            className="h-10 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      )}
      <Button variant="outline" size="pill" icon={Filter}>Filter</Button>
      <Button variant="outline" size="pill" icon={Download}>Export</Button>
      {onAdd && <Button variant="brand" size="pill" icon={Plus} onClick={onAdd}>{addLabel || "Add"}</Button>}
    </div>
  );
};

export default Toolbar;