import { useState, useEffect, useCallback } from 'react'

export interface FilterConfig {
  field: string
  value: any
  operator?: 'eq' | 'like' | 'gte' | 'lte' | 'in'
}

export interface DateRangeFilter {
  startDate: string
  endDate: string
  field: string
}

export function useSearchFilter<T>(
  data: T[],
  searchFields: (keyof T)[],
  debounceMs: number = 500
) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter | null>(null)
  const [filteredData, setFilteredData] = useState<T[]>(data)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [searchTerm, debounceMs])

  // Apply filters
  useEffect(() => {
    let result = [...data]

    // Apply search
    if (debouncedSearchTerm) {
      const lowerSearch = debouncedSearchTerm.toLowerCase()
      result = result.filter((item) =>
        searchFields.some((field) => {
          const value = item[field]
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(lowerSearch)
        })
      )
    }

    // Apply filters with AND logic
    filters.forEach((filter) => {
      result = result.filter((item) => {
        const value = (item as any)[filter.field]

        switch (filter.operator || 'eq') {
          case 'eq':
            return value === filter.value
          case 'like':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase())
          case 'gte':
            return value >= filter.value
          case 'lte':
            return value <= filter.value
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value)
          default:
            return true
        }
      })
    })

    // Apply date range filter
    if (dateRangeFilter) {
      const { startDate, endDate, field } = dateRangeFilter

      // Validate date range
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        // Invalid range, skip filter
        console.warn('Invalid date range: start date is after end date')
      } else {
        result = result.filter((item) => {
          const dateValue = (item as any)[field]
          if (!dateValue) return false

          const itemDate = new Date(dateValue)
          const start = startDate ? new Date(startDate) : null
          const end = endDate ? new Date(endDate) : null

          if (start && itemDate < start) return false
          if (end && itemDate > end) return false

          return true
        })
      }
    }

    setFilteredData(result)
  }, [data, debouncedSearchTerm, filters, dateRangeFilter, searchFields.join(',')])

  const addFilter = useCallback((filter: FilterConfig) => {
    setFilters((prev) => [...prev, filter])
  }, [])

  const removeFilter = useCallback((field: string) => {
    setFilters((prev) => prev.filter((f) => f.field !== field))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters([])
    setSearchTerm('')
    setDebouncedSearchTerm('')
    setDateRangeFilter(null)
  }, [])

  const setDateRange = useCallback((startDate: string, endDate: string, field: string) => {
    setDateRangeFilter({ startDate, endDate, field })
  }, [])

  const clearDateRange = useCallback(() => {
    setDateRangeFilter(null)
  }, [])

  return {
    searchTerm,
    setSearchTerm,
    filters,
    addFilter,
    removeFilter,
    resetFilters,
    dateRangeFilter,
    setDateRange,
    clearDateRange,
    filteredData,
    hasActiveFilters: searchTerm !== '' || filters.length > 0 || dateRangeFilter !== null,
  }
}
