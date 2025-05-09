import Viewer3D from './components/Viewer3D';

function App() {
  return (
    <div>
      <h1 style={{ textAlign: 'center' }}>Dental 3D Scan Annotator</h1>
      <Viewer3D modelPath="/sample.stl" />
    </div>
  );
}

export default App;
