import * as React from "react"

import { cn } from "@/lib/utils"

const TABLE_CONTAINER_CLASS = "relative w-full overflow-auto"
const TABLE_CLASS = "w-full caption-bottom text-sm"
const TABLE_HEADER_CLASS = "[&_tr]:border-b"
const TABLE_BODY_CLASS = "[&_tr:last-child]:border-0"
const TABLE_FOOTER_CLASS = "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0"
const TABLE_ROW_CLASS =
  "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
const TABLE_HEAD_CLASS =
  "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
const TABLE_CELL_CLASS = "p-4 align-middle [&:has([role=checkbox])]:pr-0"
const TABLE_CAPTION_CLASS = "mt-4 text-sm text-muted-foreground"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className={TABLE_CONTAINER_CLASS} tabIndex={0}>
    <table
      ref={ref}
      className={cn(TABLE_CLASS, className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn(TABLE_HEADER_CLASS, className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(TABLE_BODY_CLASS, className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(TABLE_FOOTER_CLASS, className)}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(TABLE_ROW_CLASS, className)}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(TABLE_HEAD_CLASS, className)}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(TABLE_CELL_CLASS, className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(TABLE_CAPTION_CLASS, className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
