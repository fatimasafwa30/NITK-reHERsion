import { Link } from 'react-router-dom';
import styles from './Button.module.css';

/**
 * @param {{variant?: 'primary'|'secondary'|'ghost', to?: string, href?: string}} props
 * Pass `to` for internal client-side navigation, `href` for anchors/external links,
 * or neither for a plain <button>.
 */
export default function Button({ variant = 'primary', to, href, className = '', children, ...rest }) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
