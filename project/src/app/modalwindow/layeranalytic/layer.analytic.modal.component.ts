
import { AfterViewInit, Component } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { LayerModel } from '@auscope/portal-core-ui';



@Component({
  selector: 'app-layer-modal-window',
  templateUrl: './layer.analytic.modal.component.html'
})

export class LayerAnalyticModalComponent implements AfterViewInit {
  public analyticMap;
  public layer: LayerModel;


  constructor(public bsModalRef: BsModalRef) {

  }

    ngAfterViewInit() {

    }


}
