// 旧 WebView 未提供 throwIfAborted()，直接检查状态并保留原取消原因。
export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError')
}
