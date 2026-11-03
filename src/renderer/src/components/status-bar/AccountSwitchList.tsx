import React from 'react'
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu'

export function AccountSwitchList({
  heading,
  badge,
  children
}: {
  heading: string
  /** Shown beside the heading, e.g. a mode the list is in. */
  badge?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="pb-1">
      <DropdownMenuLabel>
        {badge ? (
          <span className="inline-flex items-center gap-2">
            {heading}
            {badge}
          </span>
        ) : (
          heading
        )}
      </DropdownMenuLabel>
      <div className="max-h-[min(300px,40vh)] overflow-y-auto scrollbar-sleek">{children}</div>
    </div>
  )
}
