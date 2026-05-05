## Add "Preise" Tab to Dashboard Navigation

Edit `src/pages/OriginalDashboard.tsx` only:

1. **Import**: Extend the `react-router-dom` import to include `useNavigate` alongside `useLocation`.
2. **Hook**: Add `const navigate = useNavigate();` directly under `const location = useLocation();`.
3. **Tabs array**: Insert `{ name: 'Preise', emoji: '💶' }` between `Wäsche` and `Einstellungen`.
4. **Tab click handler**: Update the `tabs.map(...)` button so clicking `Preise` calls `navigate('/pricing')`, all other tabs continue to use `setActiveTab(tab.name)`.
5. **Grid columns**: Change `<nav>` className from `sm:grid-cols-5` to `sm:grid-cols-6` to accommodate the new tab.

No changes to `renderTabContent()`, no other files touched. The `/pricing` route already exists.
