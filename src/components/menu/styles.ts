export const menuStyles = `
.side-menu {
  background: #2a2a2a;
  color: #fff;
  padding: 16px;
  min-width: 200px;
  border-right: 1px solid #3a3a3a;
}

.menu-button {
  width: 100%;
  padding: 10px;
  background: #3a3a3a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s ease;
  margin-bottom: 10px;
}

.menu-button:hover {
  background: #444;
}

.menu-select {
  width: 100%;
  padding: 8px;
  background: #3a3a3a;
  color: #fff;
  border: 1px solid #4a4a4a;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
  cursor: pointer;
  outline: none;
}

.menu-select:focus {
  border-color: #666;
}

.menu-input {
  width: 100%;
  padding: 8px;
  background: #3a3a3a;
  color: #fff;
  border: 1px solid #4a4a4a;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
  outline: none;
}

.menu-input:focus {
  border-color: #666;
}

.menu-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin: 16px 0 8px;
}

.chapter-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.chapter-item {
  margin: 4px 0;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.chapter-item.dragging {
  opacity: 0.5;
}

.chapter-link {
  display: block;
  padding: 8px 12px;
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chapter-link:hover {
  background: #3a3a3a;
}

.chapter-link.active {
  background: #444;
  font-weight: 500;
}

.menu-divider {
  height: 1px;
  background: #3a3a3a;
  margin: 16px 0;
}
`; 