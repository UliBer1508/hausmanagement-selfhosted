const SimpleTest = () => {
  console.log('SimpleTest component is rendering');
  
  return (
    <div style={{ 
      padding: '20px', 
      background: 'white', 
      minHeight: '100vh',
      fontSize: '18px',
      color: 'black'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>ADMIN BILDSCHIRM TEST</h1>
      <p>Wenn du das siehst, funktioniert das Rendering grundsätzlich.</p>
      <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0' }}>
        <p>Route: /</p>
        <p>Timestamp: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default SimpleTest;