export class LRUCache {
	private cache: Map<string, any>
	private maxSize: number

	constructor(maxSize: number = 100) {
		this.cache = new Map()
		this.maxSize = maxSize
	}

	get(key: string): any | undefined {
		const value = this.cache.get(key)
		if (value !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(key)
			this.cache.set(key, value)
		}
		return value
	}

	set(key: string, value: any): void {
		if (this.cache.size >= this.maxSize) {
			// Remove oldest item (first inserted)
			const firstKey = this.cache.keys().next().value
			if (firstKey !== undefined) {
				this.cache.delete(firstKey)
			}
		}
		this.cache.set(key, value)
	}

	clear(): void {
		this.cache.clear()
	}
}
