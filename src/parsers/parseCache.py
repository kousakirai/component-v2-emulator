"""
Parse Cache Module
Caches Python AST parse results to improve performance
"""
from typing import Dict, Optional, Tuple
import hashlib
import time


class CacheEntry:
    """Single cache entry with content hash and timestamp"""
    
    def __init__(self, content_hash: str, result: dict, timestamp: float):
        self.content_hash = content_hash
        self.result = result
        self.timestamp = timestamp


class ParseCache:
    """Cache for Python AST parse results"""
    
    def __init__(self, max_age: float = 30.0):
        """
        Initialize cache
        
        Args:
            max_age: Maximum age of cache entries in seconds (default: 30s)
        """
        self.cache: Dict[str, CacheEntry] = {}
        self.max_age = max_age
        self.hits = 0
        self.misses = 0
    
    def get(self, file_path: str, content: str) -> Optional[dict]:
        """
        Get cached parse result
        
        Args:
            file_path: Path to the file
            content: Current content of the file
            
        Returns:
            Cached result if valid, None otherwise
        """
        entry = self.cache.get(file_path)
        
        if entry is None:
            self.misses += 1
            return None
        
        # Check if content changed
        content_hash = self._hash_content(content)
        if entry.content_hash != content_hash:
            self.cache.pop(file_path)
            self.misses += 1
            return None
        
        # Check if expired
        age = time.time() - entry.timestamp
        if age > self.max_age:
            self.cache.pop(file_path)
            self.misses += 1
            return None
        
        self.hits += 1
        return entry.result
    
    def set(self, file_path: str, content: str, result: dict) -> None:
        """
        Store parse result in cache
        
        Args:
            file_path: Path to the file
            content: Content of the file
            result: Parse result to cache
        """
        content_hash = self._hash_content(content)
        self.cache[file_path] = CacheEntry(
            content_hash=content_hash,
            result=result,
            timestamp=time.time()
        )
    
    def invalidate(self, file_path: str) -> None:
        """
        Invalidate cache for a specific file
        
        Args:
            file_path: Path to the file
        """
        self.cache.pop(file_path, None)
    
    def clear(self) -> None:
        """Clear all cache entries"""
        self.cache.clear()
        self.hits = 0
        self.misses = 0
    
    def get_stats(self) -> Dict[str, any]:
        """
        Get cache statistics
        
        Returns:
            Dictionary with cache statistics
        """
        total = self.hits + self.misses
        hit_rate = (self.hits / total * 100) if total > 0 else 0
        
        return {
            'hits': self.hits,
            'misses': self.misses,
            'total_requests': total,
            'hit_rate_percent': round(hit_rate, 2),
            'cached_files': len(self.cache)
        }
    
    @staticmethod
    def _hash_content(content: str) -> str:
        """
        Calculate hash of file content
        
        Args:
            content: File content
            
        Returns:
            SHA256 hash of content
        """
        return hashlib.sha256(content.encode('utf-8')).hexdigest()


# Global cache instance
_global_cache: Optional[ParseCache] = None


def get_cache() -> ParseCache:
    """Get or create global cache instance"""
    global _global_cache
    if _global_cache is None:
        _global_cache = ParseCache()
    return _global_cache
