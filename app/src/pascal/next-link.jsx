export default function Link({ href, children, ...props }) {
  return <a href={typeof href === 'string' ? href : href?.pathname ?? '#'} {...props}>{children}</a>;
}
