from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import numpy as np
from rasterio.transform import from_origin
from scripts.preprocessar_topografia import calcular_declividade

def test_slope_preserves_nodata_and_neighbor_without_gradient():
    altitude=np.full((5,5),700.0)
    altitude[2,2]=-9999
    slope=calcular_declividade(altitude,from_origin(0,25,5,5),-9999)
    assert slope[2,2]==-9999
    assert slope[2,1]==-9999
    assert slope[0,0]==0
