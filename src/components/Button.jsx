import { Link } from 'react-router-dom';
import styles from './Button.module.css';

/**
 * @param {{
 *  variant?: 'primary'|'secondary'|'ghost'|'quiet'|'danger-quiet',
 *  size?: 'sm'|'md'|'lg',
 *  to?: string, href?: string,
 *  iconLeft?: React.ReactNode, iconRight?: React.ReactNode,
 *  full?: boolean,
 * }} props
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  to,
  href,
  iconLeft,
  iconRight,
  full = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    styles.btn,
    styles[variant],
    styles[size],
    full ? styles.full : '',
    className,
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {iconLeft && <span className={styles.icon} aria-hidden="true">{iconLeft}</span>}
      {children && <span className={styles.label}>{children}</span>}
      {iconRight && <span className={styles.icon} aria-hidden="true">{iconRight}</span>}
    </>
  );

  if (to) return <Link to={to} className={classes} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{inner}</a>;
  return <button type="button" className={classes} {...rest}>{inner}</button>;
}
