import LoadingView from '../view/view-loading';
import NewPointPresenter from './new-point-presenter';
import NoPointsView from '../view/view-no-points';
import PointListView from '../view/view-point_list';
import PointPresenter from './travel-point-presenter';
import SortingView from '../view/view-sorting';
import UiBlocker from '../framework/ui-blocker/ui-blocker.js';
import { remove, render, RenderPosition } from '../framework/render';
import { FilterType, SortType, UpdateType, UserAction } from '../const';
import { filter, sortByDay, sortByPrice } from '../util';

const TimeLimit = {
  LOWER_LIMIT: 300,
  UPPER_LIMIT: 1000,
};

export default class BoardPresenter {
  #boardContainer = null;
  #currentSortType = 'sort-day';
  #filterModel = null;
  #filterType = FilterType.ALL;
  #isLoading = true;
  #loadingComponent = new LoadingView();
  #newPointPresenter = null;
  #noPointComponent = null;
  #pointListComponent = new PointListView();
  #pointsModel = null;
  #pointsPresenters = new Map();
  #sortPoints = null;
  #uiBlocker = new UiBlocker({
    lowerLimit: TimeLimit.LOWER_LIMIT,
    upperLimit: TimeLimit.UPPER_LIMIT
  });

  constructor({ boardContainer, pointsModel, filterModel, onNewPointDestroy }) {
    this.#boardContainer = boardContainer;
    this.#pointsModel = pointsModel;
    this.#filterModel = filterModel;

    this.#newPointPresenter = new NewPointPresenter({
      pointListContainer: this.#pointListComponent.element,
      onDataChange: this.#handleViewAction,
      onDestroy: onNewPointDestroy
    });

    this.#pointsModel.addObserver(this.#handleModelEvent);
    this.#filterModel.addObserver(this.#handleModelEvent);
  }

  init() {
    this.#renderBoard();
  }

  get destinations() { return this.#pointsModel.destinations; }

  get offers() { return this.#pointsModel.offers; }

  get points() {
    this.#filterType = this.#filterModel.filter;
    const points = this.#pointsModel.points;
    const filteredPoints = filter[this.#filterType](points);
    switch (this.#currentSortType) {
      case 'sort-day':
        return filteredPoints.sort(sortByDay);
      case 'sort-price':
        return filteredPoints.sort(sortByPrice);
    }
    return filteredPoints;
  }

  createPoint() {
    this.#currentSortType = SortType.DAY;
    this.#filterModel.setFilter(UpdateType.MAJOR, FilterType.EVERYTHING);
    this.#newPointPresenter.init(this.#pointsModel.offers, this.#pointsModel.destinations);
  }

  #clearBoard({ resetSortType = false } = {}) {
    this.#newPointPresenter.destroy();
    this.#pointsPresenters.forEach((presenter) => presenter.destroy());
    this.#pointsPresenters.clear();
    remove(this.#sortPoints);
    if (this.#noPointComponent) { remove(this.#noPointComponent); }
    if (resetSortType) { this.#currentSortType = SortType.DAY; }
  }

  #handleModeChange = () => {
    this.#newPointPresenter.destroy();
    this.#pointsPresenters.forEach((presenter) => presenter.resetView());
  };

  #handleModelEvent = (updateType, data) => {
    switch (updateType) {
      case UpdateType.PATCH:
        this.#pointsPresenters.get(data.id).init(data, this.#pointsModel.offers, this.#pointsModel.destinations);
        this.#clearBoard();
        this.#renderBoard();
        break;
      case UpdateType.MINOR:
        this.#clearBoard();
        this.#renderBoard();
        break;
      case UpdateType.MAJOR:
        this.#clearBoard({ resetRenderedPointsCount: true, resetSortType: true });
        this.#renderBoard();
        break;
      case UpdateType.INIT:
        this.#isLoading = false;
        remove(this.#loadingComponent);
        this.#renderBoard();
        break;
    }
  };

  #handleSortTypeChange = (sortType) => {
    if (this.#currentSortType === sortType) { return; }
    this.#currentSortType = sortType;
    this.#clearBoard({ resetRenderedPointsCount: true });
    this.#renderBoard();
  };

  #handleViewAction = async (actionType, updateType, update) => {
    this.#uiBlocker.block();
    switch (actionType) {
      case UserAction.ADD_POINT:
        this.#newPointPresenter.setSaving();
        try {
          await this.#pointsModel.addPoint(updateType, update);
        } catch (err) {
          this.#pointsPresenters.get(update.id).setAborting();
        }
        break;
      case UserAction.UPDATE_POINT:
        this.#pointsPresenters.get(update.id).setSaving();
        try {
          await this.#pointsModel.updatePoint(updateType, update);
        } catch (err) {
          this.#pointsPresenters.get(update.id).setAborting();
        }
        break;
      case UserAction.DELETE_POINT:
        this.#pointsPresenters.get(update.id).setDeleting();
        try {
          await this.#pointsModel.deletePoint(updateType, update);
        } catch (err) {
          this.#pointsPresenters.get(update.id).setAborting();
        }
        break;
    }
    this.#uiBlocker.unblock();
  };

  #renderNoPoints() {
    remove(this.#sortPoints);
    remove(this.#loadingComponent);
    this.#noPointComponent = new NoPointsView({
      filterType: this.#filterType
    });
    render(this.#noPointComponent, this.#boardContainer, RenderPosition.AFTERBEGIN);
  }

  #renderPoint(point) {
    const pointPresenter = new PointPresenter({
      pointListContainer: this.#pointListComponent.element,
      onModeChange: this.#handleModeChange,
      onDataChange: this.#handleViewAction
    });


    pointPresenter.init(point, this.offers, this.destinations);
    this.#pointsPresenters.set(point.id, pointPresenter);
  }

  #renderBoard() {
    const points = this.points;
    if (this.#isLoading) {
      this.#renderLoading();
      return;
    }
    if (points.length === 0) {
      this.#renderNoPoints();
      return;
    }
    this.#renderSort();
    this.#renderPointsList();
  }

  #renderPoints() {
    this.points.forEach((point) => this.#renderPoint(point));
  }

  #renderPointsList() {
    render(this.#pointListComponent, this.#boardContainer);
    this.#renderPoints();
  }

  #renderLoading() {
    render(this.#loadingComponent, this.#boardContainer, RenderPosition.AFTERBEGIN);
  }

  #renderSort() {
    this.#sortPoints = new SortingView({
      onSortTypeChange: this.#handleSortTypeChange,
      currentSortType: this.#currentSortType
    });
    render(this.#sortPoints, this.#boardContainer);
  }
}
