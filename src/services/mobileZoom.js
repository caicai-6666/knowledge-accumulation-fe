// 阻止整页缩放；树图和附件预览各自处理容器内的自定义缩放。
export function installMobileZoomGuard(target = document, mobile = () => window.matchMedia('(max-width: 900px)').matches) {
  const options = { passive: false }
  function preventPageGesture(event) {
    if (mobile() && event.cancelable) event.preventDefault()
  }
  function preventPinch(event) {
    if (event.touches.length > 1) preventPageGesture(event)
  }
  target.addEventListener('gesturestart', preventPageGesture, options)
  target.addEventListener('gesturechange', preventPageGesture, options)
  target.addEventListener('touchmove', preventPinch, options)
  return () => {
    target.removeEventListener('gesturestart', preventPageGesture, options)
    target.removeEventListener('gesturechange', preventPageGesture, options)
    target.removeEventListener('touchmove', preventPinch, options)
  }
}
