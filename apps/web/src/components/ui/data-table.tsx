import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FilterIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { rankItem } from "@tanstack/match-sorter-utils";
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

// Filter configuration types
interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface SingleDropdownFilter {
  type: "single-dropdown";
  columnId: string;
  label: string;
  options: FilterOption[];
  transformValue?: (value: string) => unknown;
}

interface MultiDropdownFilter {
  type: "multi-dropdown";
  label: string;
  subMenus?: boolean;
  groups: {
    columnId: string;
    label: string;
    options: FilterOption[];
    transformValue?: (value: string) => unknown;
  }[];
}

interface SearchFilter {
  type: "search";
  placeholder: string;
  searchColumns: string[];
}

export type FilterConfig =
  | SingleDropdownFilter
  | MultiDropdownFilter
  | SearchFilter;

// Action button configuration
export interface ActionButton {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?:
    | "link"
    | "outline"
    | "ghost"
    | "default"
    | "secondary"
    | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  hideOnMobile?: boolean;
  hideLabelOnMobile?: boolean;
}

// Main component props
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filters?: FilterConfig[];
  /** Controlled search text shown in the toolbar search input. */
  searchValue?: string;
  /** Called whenever search text changes. Useful for URL/query-param syncing. */
  onSearchChange?: (value: string) => void;
  /** Controlled active filter values keyed by columnId. */
  activeFilterValues?: Record<string, string[]>;
  /** Called whenever a dropdown filter changes. Useful for URL/query-param syncing. */
  onFilterChange?: (columnId: string, values: string[]) => void;
  /** Called to clear all active filters at once. */
  onClearAllFilters?: () => void;
  /** Enable fuzzy matching for the global search input. */
  enableFuzzyGlobalFilter?: boolean;
  /** Skip client-side filtering when data is already filtered server-side. */
  manualFiltering?: boolean;
  actionButtons?: ActionButton[];
  defaultSorting?: SortingState;
  defaultPagination?: PaginationState;
  paginationItemsToDisplay?: number;
  showPageSizeSelector?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: TData) => void;
  /** Total row count from the server. When provided, enables manual server-side pagination. */
  rowCount?: number;
  /** Controlled pagination state (required when using rowCount for server-side pagination). */
  pagination?: PaginationState;
  /** Pagination state setter (required when using rowCount for server-side pagination). */
  onPaginationChange?: Dispatch<SetStateAction<PaginationState>>;
  /** Optional rows rendered at the end of the table body (e.g. infinite-loading rows). */
  tableBodyAppend?: ReactNode;
  /**
   * Render only the rows in view instead of all of them. Ignored when `rowCount` is set,
   * since those tables already hold a single server-sized page.
   */
  virtualize?: boolean;
  /** Height of the scroll viewport while virtualizing. */
  virtualMaxHeight?: string;
  /**
   * Called when scrolling reaches the end of the list, so a paged table can
   * fetch the next page without a button. Only observed while virtualizing,
   * since that is the only mode with a scroll viewport of its own.
   */
  onReachEnd?: () => void;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

/** Approximate row height in px, used to size the virtual window. */
const VIRTUAL_ROW_ESTIMATE = 44;
/** Extra rows rendered above and below the viewport to hide scroll seams. */
const VIRTUAL_OVERSCAN = 12;

export const DataTable = <TData, TValue>({
  columns,
  data,
  filters = [],
  searchValue,
  onSearchChange,
  activeFilterValues,
  onFilterChange,
  onClearAllFilters,
  enableFuzzyGlobalFilter = false,
  manualFiltering = false,
  actionButtons = [],
  defaultSorting = [],
  defaultPagination = { pageIndex: 0, pageSize: 10 },
  paginationItemsToDisplay = 5,
  showPageSizeSelector = false,
  emptyMessage = "No results.",
  className,
  onRowClick,
  rowCount,
  pagination: controlledPagination,
  onPaginationChange: setControlledPagination,
  tableBodyAppend,
  virtualize = false,
  virtualMaxHeight = "70vh",
  onReachEnd,
}: DataTableProps<TData, TValue>) => {
  const isServerSide = rowCount !== undefined;
  // a server-paged table already holds one page, so there is nothing to
  // virtualize
  const isVirtual = virtualize && !isServerSide;
  const isPaginationControlled =
    controlledPagination !== undefined && setControlledPagination !== undefined;

  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [internalPagination, setInternalPagination] =
    useState<PaginationState>(defaultPagination);

  const pagination = isPaginationControlled
    ? controlledPagination
    : internalPagination;

  // For tracking active filters for all dropdown types
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>(
    {},
  );

  const effectiveGlobalFilter = searchValue ?? globalFilter;
  const effectiveActiveFilters = activeFilterValues ?? activeFilters;
  const effectiveColumnFilters = useMemo<ColumnFiltersState>(() => {
    if (!activeFilterValues) {
      return columnFilters;
    }

    return Object.entries(activeFilterValues)
      .filter(([, values]) => values.length > 0)
      .map(([id, values]) => ({ id, value: values }));
  }, [activeFilterValues, columnFilters]);

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    enableMultiSort: false,
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    manualFiltering,
    onColumnFiltersChange: setColumnFilters,
    getPaginationRowModel:
      isServerSide || isVirtual ? undefined : getPaginationRowModel(),
    manualPagination: isServerSide || isVirtual,
    rowCount: isServerSide ? rowCount : isVirtual ? data.length : undefined,
    autoResetPageIndex: false,
    onPaginationChange: isPaginationControlled
      ? setControlledPagination
      : setInternalPagination,
    onGlobalFilterChange: (value) => {
      const nextValue = String(value ?? "");
      setGlobalFilter(nextValue);
      onSearchChange?.(nextValue);
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchFilter = filters.find((f) => f.type === "search");

      if (!searchFilter) return true;

      const searchValue = String(filterValue ?? "").trim();

      if (!searchValue) return true;

      return searchFilter.searchColumns.some((column) => {
        const value =
          row.getValue(column) ??
          (row.original as Record<string, unknown> | undefined)?.[column];
        const text = String(value ?? "");

        if (enableFuzzyGlobalFilter) {
          return rankItem(text, searchValue).passed;
        }

        return text.toLowerCase().includes(searchValue.toLowerCase());
      });
    },
    state: {
      sorting,
      columnFilters: effectiveColumnFilters,
      pagination,
      globalFilter: effectiveGlobalFilter,
    },
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);

  // this stays inert when not virtualizing because scrollRef is
  // never attached in that case
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE,
    overscan: VIRTUAL_OVERSCAN,
  });

  const virtualItems = isVirtual ? virtualizer.getVirtualItems() : [];

  // row indexes to render: the visible window when virtualizing, all of them
  // otherwise
  const visibleIndexes = isVirtual
    ? virtualItems.map((item) => item.index)
    : rows.map((_, index) => index);

  // spacer heights stand in for the rows above and below the window, so the
  // scrollbar reflects the full list rather than only what is mounted.
  const padTop = virtualItems[0]?.start ?? 0;
  const padBottom = isVirtual
    ? virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
    : 0;

  // used to know when the scrolling reaches the bottom of the scroll viewport
  const sentinelRef = useRef<HTMLTableCellElement>(null);

  // held in a ref so the observer below is built once
  const onReachEndRef = useRef(onReachEnd);

  useEffect(() => {
    onReachEndRef.current = onReachEnd;
  }, [onReachEnd]);

  // Auto-load fires at most once per entry into view. Once a paged list hits its
  // page cap the content stops growing, so the sentinel stays parked on screen:
  // firing on visibility alone would load a page, drop the oldest, sit at the
  // same height, and trigger again immediately. Latching on the transition --
  // leaving the viewport re-arms it -- breaks that, and unlike watching scroll
  // events it cannot be re-armed by the browser clamping scrollTop when the list
  // height changes.
  const armedRef = useRef(true);

  // The sentinel only exists once there are rows to render, so this has to be a
  // dependency: observing on mount alone would find no node and never retry.
  // `hasRows` flips false->true exactly once per result set, so this does not
  // reintroduce the re-observe loop above.
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (!isVirtual || !hasRows) return;

    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (!visible) {
          armedRef.current = true;
          return;
        }
        if (!armedRef.current) return;
        armedRef.current = false;
        onReachEndRef.current?.();
      },
      // trigger slightly before the true bottom so the next page is usually
      // loaded by the time the user reaches the last row
      { root, rootMargin: "0px 0px 200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isVirtual, hasRows]);

  const handleFilterToggle = (
    columnId: string,
    selectedValue: string,
    allowMultiple: boolean,
    transformValue?: (value: string) => unknown,
  ) => {
    const currentValues = effectiveActiveFilters[columnId] ?? [];
    const hasValue = currentValues.includes(selectedValue);
    const nextValues = hasValue
      ? currentValues.filter((value) => value !== selectedValue)
      : allowMultiple
        ? [...currentValues, selectedValue]
        : [selectedValue];

    onFilterChange?.(columnId, nextValues);

    if (!activeFilterValues) {
      setActiveFilters((prev) => ({
        ...prev,
        [columnId]: nextValues,
      }));
    }

    if (activeFilterValues) {
      return;
    }

    setColumnFilters((prev) => {
      const otherFilters = prev.filter((filter) => filter.id !== columnId);

      if (nextValues.length === 0) {
        return otherFilters;
      }

      const filterValue = transformValue
        ? nextValues.map((value) => transformValue(value))
        : nextValues;

      return [
        ...otherFilters,
        {
          id: columnId,
          value: filterValue,
        },
      ];
    });
  };

  const searchFilter = filters.find((f) => f.type === "search");
  const singleDropdownFilters = filters.filter(
    (f) => f.type === "single-dropdown",
  );
  const multiDropdownFilters = filters.filter(
    (f) => f.type === "multi-dropdown",
  );

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage: pagination.pageIndex + 1,
    totalPages: table.getPageCount(),
    paginationItemsToDisplay,
  });

  const currentPagination = table.getState().pagination;
  const firstPage = 1;
  const lastPage = table.getPageCount();
  const includesFirstPage = pages.includes(firstPage);
  const includesLastPage = pages.includes(lastPage);
  const showLeadingFirstPage = !includesFirstPage;
  const showTrailingLastPage = !includesLastPage;

  // Determine if page size selector should be shown
  const shouldShowPageSizeSelector =
    showPageSizeSelector &&
    DEFAULT_PAGE_SIZE_OPTIONS.includes(currentPagination.pageSize);

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {/* Toolbar */}
      {(searchFilter ||
        singleDropdownFilters.length > 0 ||
        multiDropdownFilters.length > 0 ||
        actionButtons.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          {searchFilter && (
            <Input
              className="max-w-72 min-w-64 rounded-md"
              onChange={(e) => {
                const nextValue = e.target.value;
                setGlobalFilter(nextValue);
                onSearchChange?.(nextValue);
              }}
              placeholder={searchFilter.placeholder}
              value={effectiveGlobalFilter}
            />
          )}

          {/* Single Dropdown Filters */}
          {singleDropdownFilters.map((filter) => {
            const selectedValue = effectiveActiveFilters[filter.columnId]?.[0];

            return (
              <DropdownMenu key={`single-filter-${filter.columnId}`}>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" variant="outline" className="h-7">
                      <HugeiconsIcon icon={FilterIcon} className="size-4" />
                      <span>{filter.label}</span>
                      {selectedValue && (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="text-primary-600 size-3.5"
                        />
                      )}
                    </Button>
                  }
                />

                <DropdownMenuContent
                  align="start"
                  className="min-w-48"
                  side="bottom"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {filter.options.map((option) => (
                      <DropdownMenuCheckboxItem
                        checked={selectedValue === option.value}
                        className="group"
                        closeOnClick
                        disabled={option.count === 0}
                        key={`${filter.columnId}-${option.value}`}
                        onCheckedChange={(checked) => {
                          const nextValues = checked ? [option.value] : [];
                          onFilterChange?.(filter.columnId, nextValues);
                          if (!activeFilterValues) {
                            setActiveFilters((prev) => ({
                              ...prev,
                              [filter.columnId]: nextValues,
                            }));
                            setColumnFilters((prev) => {
                              const others = prev.filter(
                                (f) => f.id !== filter.columnId,
                              );
                              return nextValues.length > 0
                                ? [
                                    ...others,
                                    {
                                      id: filter.columnId,
                                      value: filter.transformValue
                                        ? nextValues.map((v) =>
                                            filter.transformValue!(v),
                                          )
                                        : nextValues,
                                    },
                                  ]
                                : others;
                            });
                          }
                        }}
                      >
                        <span>{option.label}</span>
                        {option.count !== undefined && (
                          <span className="ml-auto text-xs text-muted-foreground group-focus:text-primary">
                            {option.count}
                          </span>
                        )}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {/* Multi Dropdown Filters */}
          {multiDropdownFilters.map((filter, index) => {
            const activeCount = filter.groups.reduce((count, group) => {
              return (
                count + (effectiveActiveFilters[group.columnId]?.length ?? 0)
              );
            }, 0);

            return (
              // oxlint-disable-next-line react/no-array-index-key
              <DropdownMenu key={`multi-filter-${index}`}>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" variant="outline" className="h-7">
                      <HugeiconsIcon icon={FilterIcon} className="size-4" />
                      <span>{filter.label}</span>
                      {activeCount > 0 && (
                        <span className="border-primary-600/50 bg-primary-600/20 text-primary-600 rounded border px-1 text-xs transition-all duration-300">
                          {activeCount}
                        </span>
                      )}
                    </Button>
                  }
                />

                <DropdownMenuContent
                  align="start"
                  className="min-w-48"
                  side="bottom"
                >
                  {filter.subMenus ? (
                    // Sub-menu mode: each group is a nested sub-menu
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {filter.groups.map((group) => (
                        <DropdownMenuSub key={`group-${group.columnId}`}>
                          <DropdownMenuSubTrigger className="flex items-center justify-between">
                            <span>{group.label}</span>
                            {(effectiveActiveFilters[group.columnId]?.length ??
                              0) > 0 && (
                              <span className="bg-primary-600/20 text-primary-600 h-1.5 w-1.5 rounded-full" />
                            )}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {group.options.map((option) => (
                              <DropdownMenuCheckboxItem
                                checked={(
                                  effectiveActiveFilters[group.columnId] ?? []
                                ).includes(option.value)}
                                className="group"
                                closeOnClick={false}
                                disabled={option.count === 0}
                                key={`${group.columnId}-${option.value}`}
                                onCheckedChange={() =>
                                  handleFilterToggle(
                                    group.columnId,
                                    option.value,
                                    true,
                                    group.transformValue,
                                  )
                                }
                              >
                                <span>{option.label}</span>
                                {option.count !== undefined && (
                                  <span className="ml-auto text-xs text-muted-foreground group-focus:text-primary">
                                    {option.count}
                                  </span>
                                )}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuGroup>
                  ) : (
                    // Flat mode: checkboxes directly in the dropdown with a label per group
                    filter.groups.map((group, groupIndex) => (
                      <DropdownMenuGroup key={`group-${group.columnId}`}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                        {group.options.map((option) => (
                          <DropdownMenuCheckboxItem
                            checked={(
                              effectiveActiveFilters[group.columnId] ?? []
                            ).includes(option.value)}
                            className="group"
                            closeOnClick={false}
                            disabled={option.count === 0}
                            key={`${group.columnId}-${option.value}`}
                            onCheckedChange={() =>
                              handleFilterToggle(
                                group.columnId,
                                option.value,
                                true,
                                group.transformValue,
                              )
                            }
                          >
                            <span>{option.label}</span>
                            {option.count !== undefined && (
                              <span className="ml-auto text-xs text-muted-foreground group-focus:text-primary">
                                {option.count}
                              </span>
                            )}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuGroup>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {/* Clear All Filters */}
          {(onClearAllFilters ?? onFilterChange) &&
            Object.values(effectiveActiveFilters).some((v) => v.length > 0) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (onClearAllFilters) {
                    onClearAllFilters();
                  } else {
                    singleDropdownFilters.forEach((f) => {
                      onFilterChange?.(f.columnId, []);
                      if (!activeFilterValues) {
                        setActiveFilters((prev) => ({
                          ...prev,
                          [f.columnId]: [],
                        }));
                      }
                    });
                    if (!activeFilterValues) {
                      setColumnFilters([]);
                    }
                  }
                }}
              >
                Clear filters
              </Button>
            )}

          {/* Action Buttons */}
          {actionButtons.map((button, index) => (
            <Button
              className={cn(
                button.hideOnMobile && "hidden sm:inline-flex",
                index === actionButtons.length - 1 && "ml-auto",
              )}
              // oxlint-disable-next-line react/no-array-index-key
              key={`action-${index}`}
              onClick={button.onClick}
              size={button.size || "sm"}
              variant={button.variant || "default"}
            >
              {button.icon}
              <span
                className={cn(
                  button.hideLabelOnMobile && "hidden sm:inline-block",
                )}
              >
                {button.label}
              </span>
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      <div
        className={isVirtual ? "overflow-y-auto" : undefined}
        ref={isVirtual ? scrollRef : undefined}
        // focusable so the list can be scrolled -- and so auto-load reachable --
        // without a pointer
        tabIndex={isVirtual ? 0 : undefined}
        style={isVirtual ? { maxHeight: virtualMaxHeight } : undefined}
      >
        <Table>
          <TableHeader
            className={
              isVirtual ? "sticky top-0 z-10 bg-background" : undefined
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    colSpan={header.colSpan}
                    key={header.id}
                    className={
                      (
                        header.column.columnDef.meta as
                          | Record<string, string>
                          | undefined
                      )?.headerClassName
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        role="columnheader"
                        className={cn(
                          header.column.getCanSort() &&
                            "group flex h-full cursor-pointer items-center justify-start gap-1 select-none",
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyUp={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          className={cn(
                            "size-3.5 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-60",
                            header.column.getIsSorted() && "opacity-100",
                            header.column.getIsSorted() === "asc" &&
                              "rotate-180",
                          )}
                        />
                      </div>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              <>
                {padTop > 0 ? (
                  <TableRow aria-hidden className="hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      style={{ height: padTop }}
                    />
                  </TableRow>
                ) : null}
                {visibleIndexes.map((rowIndex) => {
                  const row = rows[rowIndex];
                  if (!row) return null;

                  return (
                    <TableRow
                      className={cn(onRowClick && "cursor-pointer")}
                      data-index={rowIndex}
                      data-state={row.getIsSelected() && "selected"}
                      key={row.id}
                      onClick={
                        onRowClick
                          ? (e: React.MouseEvent) => {
                              // Don't fire when clicking interactive elements or portaled
                              // dialogs/menus — their e.target lives in document.body but
                              // React still bubbles synthetic events up the fiber tree.
                              const target = e.target as Element;
                              if (
                                target.closest(
                                  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="menu"], [role="dialog"], [role="alertdialog"], [role="option"], [role="listbox"]',
                                )
                              ) {
                                return;
                              }
                              onRowClick(row.original);
                            }
                          : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className={
                            (
                              cell.column.columnDef.meta as
                                | Record<string, string>
                                | undefined
                            )?.cellClassName
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {padBottom > 0 ? (
                  <TableRow aria-hidden className="hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      style={{ height: padBottom }}
                    />
                  </TableRow>
                ) : null}
                {tableBodyAppend}
                {isVirtual && onReachEnd ? (
                  <TableRow aria-hidden className="hover:bg-transparent">
                    <TableCell ref={sentinelRef} colSpan={columns.length} />
                  </TableRow>
                ) : null}
              </>
            ) : tableBodyAppend ? (
              <>{tableBodyAppend}</>
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination - Only show when there are multiple pages. A virtualized table
          owns its own scrolling, so its page controls would be inert. */}
      {!isVirtual && table.getPageCount() > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          {/* Page number information */}
          <p
            aria-live="polite"
            className="flex-1 text-sm whitespace-nowrap text-muted-foreground"
          >
            Page{" "}
            <span className="text-foreground">
              {currentPagination.pageIndex + 1}
            </span>{" "}
            of <span className="text-foreground">{table.getPageCount()}</span>
          </p>

          {/* Pagination buttons */}
          <div>
            <Pagination>
              <PaginationContent>
                {/* Previous page button */}
                <PaginationItem>
                  <Button
                    aria-label="Go to previous page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    size="icon"
                    variant="outline"
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                  </Button>
                </PaginationItem>

                {/* Left ellipsis (...) */}
                {showLeadingFirstPage && (
                  <PaginationItem>
                    <Button
                      aria-current={
                        currentPagination.pageIndex + 1 === firstPage
                          ? "page"
                          : undefined
                      }
                      onClick={() => table.setPageIndex(firstPage - 1)}
                      size="icon"
                      variant={
                        currentPagination.pageIndex + 1 === firstPage
                          ? "outline"
                          : "ghost"
                      }
                    >
                      {firstPage}
                    </Button>
                  </PaginationItem>
                )}

                {showLeftEllipsis && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                {/* Page number buttons */}
                {pages.map((page) => {
                  const isActive = page === currentPagination.pageIndex + 1;
                  return (
                    <PaginationItem key={`page-${page}`}>
                      <Button
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => table.setPageIndex(page - 1)}
                        size="icon"
                        variant={isActive ? "outline" : "ghost"}
                      >
                        {page}
                      </Button>
                    </PaginationItem>
                  );
                })}

                {/* Right ellipsis (...) */}
                {showRightEllipsis && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                {showTrailingLastPage && (
                  <PaginationItem>
                    <Button
                      aria-current={
                        currentPagination.pageIndex + 1 === lastPage
                          ? "page"
                          : undefined
                      }
                      onClick={() => table.setPageIndex(lastPage - 1)}
                      size="icon"
                      variant={
                        currentPagination.pageIndex + 1 === lastPage
                          ? "outline"
                          : "ghost"
                      }
                    >
                      {lastPage}
                    </Button>
                  </PaginationItem>
                )}

                {/* Next page button */}
                <PaginationItem>
                  <Button
                    aria-label="Go to next page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    size="icon"
                    variant="outline"
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>

          {/* Results per page */}
          {shouldShowPageSizeSelector && (
            <div className="flex flex-1 justify-end">
              <Select
                aria-label="Results per page"
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
                value={currentPagination.pageSize.toString()}
              >
                <SelectTrigger
                  className="w-fit whitespace-nowrap"
                  id="results-per-page"
                >
                  <SelectValue placeholder="Select number of results" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_PAGE_SIZE_OPTIONS.map((pageSize) => (
                    <SelectItem key={pageSize} value={pageSize.toString()}>
                      {pageSize} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
