'use client'

import { useState } from 'react'

import { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { Search, X } from 'lucide-react'

import { NetworkBadge } from '@/components/badge/NetworkBadge'
import { NetworkIcon, TokenIcon } from '@/components/icon'
import {
  DataTable,
  FilterChip,
  SortableHeader,
  getUniqueColumnValues,
} from '@/components/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { WalletAvatar } from '@/components/wallet/WalletAvatar'
import { useCurrency } from '@/contexts'
import { formatCompactCurrency } from '@/lib/format-currency'
import type { WalletBalanceRow } from '@/lib/portfolio/view'
import { formatAddress } from '@/lib/utils'

import { addressColumn } from './columns.shared'

const createColumns = (
  currency: string,
  rate: number
): ColumnDef<WalletBalanceRow>[] => [
  {
    accessorKey: 'network',
    header: 'Network',
    cell: ({ row }) => <NetworkBadge networkSlug={row.original.network} />,
    meta: {
      isMobileHidden: true,
    },
  },
  addressColumn<WalletBalanceRow>(),
  {
    accessorKey: 'assetCode',
    header: 'Asset',
    cell: ({ row }) => (
      <div className="flex w-full items-center gap-2 text-xs">
        <TokenIcon symbol={row.original.assetCode} />
        <span className="font-medium">{row.original.assetCode}</span>
        {row.original.issuer && (
          <span className="text-muted-foreground">
            · {formatAddress(row.original.issuer)}
          </span>
        )}
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'balance',
    header: ({ column }) => (
      <SortableHeader column={column}>Balance</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.balance.toLocaleString(undefined, {
          maximumFractionDigits: 7,
        })}
      </span>
    ),
    enableHiding: false,
  },
  {
    id: 'valueUsd',
    // Unpriced holdings sort last in either direction (undefined sorts last).
    accessorFn: (row) => row.valueUsd ?? undefined,
    header: ({ column }) => (
      <SortableHeader column={column}>Value</SortableHeader>
    ),
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.valueUsd == null
          ? '—'
          : formatCompactCurrency(row.original.valueUsd * rate, currency)}
      </span>
    ),
    enableHiding: false,
  },
]

export function WalletBalancesTable({ data }: { data: WalletBalanceRow[] }) {
  const { baseCurrency, rate } = useCurrency()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [searchValue, setSearchValue] = useState('')

  const columns = createColumns(baseCurrency, rate)

  const networkOptions = getUniqueColumnValues(data, 'network').map((v) => ({
    value: v,
    label: (
      <div className="flex items-center gap-2">
        <NetworkIcon networkSlug={v} />
        {v.charAt(0).toUpperCase() + v.slice(1)}
      </div>
    ),
  }))

  const addressOptions = getUniqueColumnValues(data, 'userAddress').map(
    (v) => ({
      value: v,
      label: (
        <div className="flex items-center gap-2">
          <WalletAvatar address={v} size={20} />
          {formatAddress(v)}
        </div>
      ),
    })
  )

  const isFiltered = columnFilters.length > 0 || searchValue !== ''

  const filterableColumns = [
    {
      column: 'network',
      title: 'Network',
      options: networkOptions,
    },
    {
      column: 'userAddress',
      title: 'Address',
      options: addressOptions,
    },
  ]

  return (
    <div className="flex flex-col">
      <div className="border-border/50 flex flex-wrap items-center justify-between gap-3 border-b px-8 py-5">
        <div>
          <h2 className="text-foreground text-xl font-bold">Wallet balances</h2>
          <p className="text-muted-foreground text-xs">
            Assets held in your wallets, not supplied or borrowed
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              placeholder="Filter..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-36 pl-7 text-xs placeholder:text-xs"
            />
          </div>
          <FilterChip
            title="Network"
            columnId="network"
            options={networkOptions}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            renderIcon={(v) => <NetworkIcon networkSlug={v} />}
          />
          <FilterChip
            title="Address"
            columnId="userAddress"
            options={addressOptions}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
          />
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setColumnFilters([])
                setSearchValue('')
              }}
            >
              Reset <X className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        searchableColumn="assetCode"
        initialSorting={[{ id: 'valueUsd', desc: true }]}
        filterableColumns={filterableColumns}
        hideToolbar={true}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        globalFilter={searchValue}
        onGlobalFilterChange={setSearchValue}
      />
    </div>
  )
}
