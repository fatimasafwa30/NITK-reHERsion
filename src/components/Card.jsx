import { Link } from 'react-router-dom';
import styles from './Card.module.css';

/**
 * @param {{
 *  to?: string,
 *  tone?: 'plain'|'sunken'|'outlined',
 *  pad?: 'sm'|'md'|'lg',
 *  as?: keyof JSX.IntrinsicElements,
 * }} props
 */
export default function Card({
  className = '',
  children,
  as: As = 'div',
  to,
  tone = 'plain',
  pad = 'md',
  ...rest
}) {
  const classes = [styles.card, styles[tone], styles[`pad-${pad}`], to ? styles.interactive : '', className]
    .filter(Boolean).join(' ');

  if (to) return <Link to={to} className={classes} {...rest}>{children}</Link>;
  return <As className={classes} {...rest}>{children}</As>;
}
