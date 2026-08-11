export default function Image({ src, alt = '', fill: _fill, priority: _priority, ...props }) {
  return <img src={typeof src === 'string' ? src : src?.src} alt={alt} {...props} />;
}
